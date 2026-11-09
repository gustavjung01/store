import { Hono } from 'hono'
import { createRemoteJWKSet } from 'jose'
import { verifyNeonManagedJwt } from './authVerify'
import { Pool } from 'pg'
import { attachDatabasePool } from '@neon/functions'
import { codeKey, parsePageLimit, toProduct } from './catalog'
import type { DatabaseCatalogRow } from './catalog'
import { ImportFailure } from './importValidation'
import { stageImport, commitImport, rollbackImport, importHistory } from './importService'
import { CatalogError, saveCatalogProduct, recentCatalogEdits } from './catalogService'

type StoreVars = { userId: string; role: 'admin' | 'viewer' }
const app = new Hono<{ Variables: StoreVars }>()

// All values remain server-side. A Function's URL is public, not its data.
const databaseUrl = process.env.DATABASE_URL
const authBase = process.env.NEON_AUTH_BASE_URL
const jwksUrl = process.env.NEON_AUTH_JWKS_URL
if (!databaseUrl || !authBase || !jwksUrl) {
  throw new Error('Missing Neon Postgres or Managed Auth server environment')
}
const pool = new Pool({ connectionString: databaseUrl, max: 5 })
attachDatabasePool(pool)
const jwks = createRemoteJWKSet(new URL(jwksUrl))
const allowedOrigins = new Set(['https://store-nu-opal.vercel.app'])
// Never allow localhost as a production CORS origin.
if (process.env.NEON_BRANCH !== 'main') allowedOrigins.add('http://localhost:5173')

const columns = `p.company_code, p.company_code_key, p.sku, p.name, p.unit, p.category, p.image_url,
  i.quantity, i.updated_at AS inventory_updated_at,
  COALESCE(jsonb_object_agg(pp.price_type_id, pp.amount) FILTER
    (WHERE pp.price_type_id IS NOT NULL), '{}'::jsonb) AS price_map`
const joins = `LEFT JOIN public.inventory i ON i.product_id = p.id
  LEFT JOIN public.product_prices pp ON pp.product_id = p.id`
const group = `GROUP BY p.id, p.company_code, p.company_code_key, p.sku, p.name,
  p.unit, p.category, p.image_url, i.quantity, i.updated_at`

app.use('*', async (c, next) => {
  const origin = c.req.header('origin')
  if (origin && !allowedOrigins.has(origin)) return c.json({ error: 'Origin not allowed' }, 403)
  if (origin) c.header('Access-Control-Allow-Origin', origin)
  c.header('Vary', 'Origin')
  c.header('Cache-Control', 'private, no-store, max-age=0')
  c.header('X-Content-Type-Options', 'nosniff')

  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    c.header('Access-Control-Max-Age', '300')
    return c.body(null, 204)
  }

  if (c.req.path === '/health') return next()

  const header = c.req.header('authorization') || ''
  const match = /^Bearer (\S+)$/.exec(header)
  if (!match) return c.json({ error: 'Unauthorized' }, 401)
  // Verify signed JWT before looking up the authenticated identity.
  // Do not convert database outages into false "session expired" errors.
  let userId: string
  try {
    const { payload } = await verifyNeonManagedJwt(match[1], jwks, authBase)
    if (!payload.sub) return c.json({ error: 'Unauthorized' }, 401)
    userId = payload.sub
  } catch {
    // Never log the bearer token, decoded claims, or JWKS.
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const member = await pool.query<{ role: 'admin' | 'viewer' }>(
      `SELECT role FROM public.app_members WHERE user_id = $1 AND active = true LIMIT 1`, [userId],
    )
    if (!member.rows[0]) return c.json({ error: 'Tài khoản chưa được cấp quyền STORE' }, 403)
    c.set('userId', userId)
    c.set('role', member.rows[0].role)
  } catch {
    return c.json({ error: 'Không đọc được phân quyền STORE' }, 503)
  }
  await next()
})

app.get('/health', (c) => c.json({ service: 'store', status: 'ready' }))
app.get('/me', (c) => c.json({ role: c.get('role') }))

app.get('/catalog/snapshot', async (c) => {
  let limit: number
  try { limit = parsePageLimit(c.req.query('limit')) } catch { return c.json({ error: 'limit không hợp lệ' }, 400) }
  const after = c.req.query('after') ?? ''
  if (after.length > 160) return c.json({ error: 'after quá dài' }, 400)
  const db = await pool.connect()
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const [types, settings, state, items] = await Promise.all([
      db.query<{ id: string; label: string }>(
        'SELECT id,label FROM public.price_types WHERE active = true ORDER BY sort_order,label',
      ),
      db.query<{ default_price_type_id: string | null }>(
        'SELECT default_price_type_id FROM public.price_settings WHERE id = 1',
      ),
      db.query<{ updated_at: Date | null; version: string }>(
        'SELECT updated_at,version::text AS version FROM public.catalog_state WHERE id = 1',
      ),
      db.query<DatabaseCatalogRow>(
        `SELECT ${columns}
         FROM (SELECT * FROM public.products WHERE company_code_key > $1 ORDER BY company_code_key LIMIT $2) p
         ${joins}
         ${group}
         ORDER BY p.company_code_key`,
        [after, limit + 1],
      ),
    ])
    await db.query('COMMIT')
    const rows = items.rows.slice(0, limit)
    return c.json({
      products: rows.map(toProduct),
      priceTypes: types.rows,
      defaultPriceTypeId: settings.rows[0]?.default_price_type_id ?? null,
      syncedAt: new Date().toISOString(),
      version: state.rows[0]?.version ?? '0',
      dataUpdatedAt: state.rows[0]?.updated_at?.toISOString() ?? null,
      nextCursor: items.rows.length > limit ? rows[rows.length - 1].company_code_key : null,
    })
  } catch {
    await db.query('ROLLBACK').catch(() => {})
    return c.json({ error: 'Không đọc được danh mục STORE' }, 503)
  } finally {
    db.release()
  }
})

app.get('/catalog/lookup', async (c) => {
  const raw = c.req.query('code') ?? ''
  const key = codeKey(raw)
  if (!key || key.length > 160) return c.json({ error: 'Mã CTY không hợp lệ' }, 400)
  try {
    const items = await pool.query<DatabaseCatalogRow>(
      `SELECT ${columns} FROM public.products p ${joins}
       WHERE p.company_code_key = $1 ${group} LIMIT 1`,
      [key],
    )
    if (!items.rows[0]) return c.json({ product: null })
    return c.json({ product: toProduct(items.rows[0]) })
  } catch {
    return c.json({ error: 'Không tra cứu được mã CTY' }, 503)
  }
})

// Admin import endpoints use the verified membership role, never caller-submitted role.
app.use('/admin/*', async (c, next) => {
  if (c.get('role') !== 'admin') return c.json({ error: 'Chỉ quản trị viên được nhập Excel' }, 403)
  await next()
})

// Catalog writes and audit are admin-only; no SQL credentials go to the browser.
app.post('/admin/catalog/products', async (c) => {
  try {
    const payload: unknown = await c.req.json()
    const result = await saveCatalogProduct(pool, c.get('userId'), payload, 'create')
    return c.json(result, 201)
  } catch (cause) {
    const failure = cause instanceof CatalogError ? cause
      : new CatalogError('Không thể xử lý dữ liệu sản phẩm', 400)
    return c.json({ error: failure.message }, failure.status as 400 | 404 | 409 | 503)
  }
})

app.patch('/admin/catalog/products', async (c) => {
  try {
    const payload: unknown = await c.req.json()
    const result = await saveCatalogProduct(pool, c.get('userId'), payload, 'update',
      payload && typeof payload === 'object' && 'companyCode' in payload
        ? String((payload as { companyCode: unknown }).companyCode) : undefined)
    return c.json(result)
  } catch (cause) {
    const failure = cause instanceof CatalogError ? cause
      : new CatalogError('Không thể xử lý dữ liệu sản phẩm', 400)
    return c.json({ error: failure.message }, failure.status as 400 | 404 | 409 | 503)
  }
})

app.get('/admin/catalog/edits', async (c) => {
  try { return c.json(await recentCatalogEdits(pool)) }
  catch { return c.json({ error: 'Không đọc được lịch sử sửa danh mục' }, 503) }
})

function importResponse(error: unknown, origin?: string): Response {
  const failure = error instanceof ImportFailure ? error : new ImportFailure('Không xử lý được yêu cầu nhập Excel', 503)
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  })
  // Preserve CORS on all import errors, but never reflect unknown origins.
  if (origin && allowedOrigins.has(origin)) headers.set('Access-Control-Allow-Origin', origin)
  return new Response(JSON.stringify({ error: failure.message }), { status: failure.status, headers })
}

app.post('/admin/import/preview', async (c) => {
  try {
    const length = Number(c.req.header('content-length') || 0)
    if (length > 1900000) throw new ImportFailure('Lượt nhập quá lớn; chia nhỏ file Excel', 413)
    const body = await c.req.text()
    if (body.length > 1900000) throw new ImportFailure('Dữ liệu import quá lớn', 413)
    let data: unknown
    try { data = JSON.parse(body) } catch { throw new ImportFailure('JSON không hợp lệ', 400) }
    const result = await stageImport(pool, c.get('userId'), data)
    return c.json(result, result.valid ? 200 : 422)
  } catch (error) { return importResponse(error, c.req.header('origin')) }
})

app.post('/admin/import/commit', async (c) => {
  try {
    const input: unknown = await c.req.json()
    const id = input && typeof input === 'object' && 'batchId' in input ? (input as { batchId:unknown }).batchId : null
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new ImportFailure('Mã lượt nhập không hợp lệ',400)
    return c.json(await commitImport(pool,c.get('userId'),id))
  } catch (error) { return importResponse(error, c.req.header('origin')) }
})

app.post('/admin/import/rollback', async (c) => {
  try {
    const input: unknown = await c.req.json()
    const id = input && typeof input === 'object' && 'batchId' in input ? (input as { batchId:unknown }).batchId : null
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new ImportFailure('Mã lượt nhập không hợp lệ',400)
    return c.json(await rollbackImport(pool,c.get('userId'),id))
  } catch (error) { return importResponse(error, c.req.header('origin')) }
})

app.get('/admin/imports', async (c) => {
  try { return c.json(await importHistory(pool)) }
  catch { return c.json({ error: 'Không đọc được lịch sử nhập' }, 503) }
})

app.onError((_error, c) => c.json({ error: 'Lỗi máy chủ STORE' }, 500))
export default app
