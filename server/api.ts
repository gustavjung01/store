import { Hono } from 'hono'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { Pool } from 'pg'
import { attachDatabasePool } from '@neon/functions'
import { codeKey, parsePageLimit, toProduct } from './catalog'
import type { DatabaseCatalogRow } from './catalog'

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
const authIssuer = new URL(authBase).origin
const allowedOrigins = new Set([
  'https://store-nu-opal.vercel.app',
  'http://localhost:5173',
])

const columns = `p.company_code, p.company_code_key, p.sku, p.name, p.unit, p.image_url,
  i.quantity, i.updated_at AS inventory_updated_at,
  COALESCE(jsonb_object_agg(pp.price_type_id, pp.amount) FILTER
    (WHERE pp.price_type_id IS NOT NULL), '{}'::jsonb) AS price_map`
const joins = `LEFT JOIN public.inventory i ON i.product_id = p.id
  LEFT JOIN public.product_prices pp ON pp.product_id = p.id`
const group = `GROUP BY p.id, p.company_code, p.company_code_key, p.sku, p.name,
  p.unit, p.image_url, i.quantity, i.updated_at`

app.use('*', async (c, next) => {
  const origin = c.req.header('origin')
  if (origin && !allowedOrigins.has(origin)) return c.json({ error: 'Origin not allowed' }, 403)
  if (origin) c.header('Access-Control-Allow-Origin', origin)
  c.header('Vary', 'Origin')
  c.header('Cache-Control', 'private, no-store, max-age=0')
  c.header('X-Content-Type-Options', 'nosniff')

  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    c.header('Access-Control-Max-Age', '300')
    return c.body(null, 204)
  }

  if (c.req.path === '/health') return next()

  const header = c.req.header('authorization') || ''
  const match = /^Bearer (\S+)$/.exec(header)
  if (!match) return c.json({ error: 'Unauthorized' }, 401)
  try {
    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: authIssuer,
      algorithms: ['EdDSA'],
    })
    const userId = payload.sub
    if (!userId) return c.json({ error: 'Unauthorized' }, 401)
    const member = await pool.query<{ role: 'admin' | 'viewer' }>(
      `SELECT role FROM public.app_members WHERE user_id = $1 AND active = true LIMIT 1`, [userId],
    )
    if (!member.rows[0]) return c.json({ error: 'Tài khoản chưa được cấp quyền STORE' }, 403)
    c.set('userId', userId)
    c.set('role', member.rows[0].role)
  } catch (error) {
    // Never write token, JWT, or personally identifying claims to logs.
    if (error instanceof Error && /relation .*app_members.* does not exist/i.test(error.message)) {
      return c.json({ error: 'STORE database chưa được khởi tạo' }, 503)
    }
    return c.json({ error: 'Unauthorized' }, 401)
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
  try {
    const [types, settings, state, items] = await Promise.all([
      pool.query<{ id: string; label: string }>(
        'SELECT id,label FROM public.price_types WHERE active = true ORDER BY sort_order,label',
      ),
      pool.query<{ default_price_type_id: string | null }>(
        'SELECT default_price_type_id FROM public.price_settings WHERE id = 1',
      ),
      pool.query<{ updated_at: Date | null }>(
        'SELECT updated_at FROM public.catalog_state WHERE id = 1',
      ),
      pool.query<DatabaseCatalogRow>(
        `SELECT ${columns}
         FROM (SELECT * FROM public.products WHERE company_code_key > $1 ORDER BY company_code_key LIMIT $2) p
         ${joins}
         ${group}
         ORDER BY p.company_code_key`,
        [after, limit + 1],
      ),
    ])
    const rows = items.rows.slice(0, limit)
    return c.json({
      products: rows.map(toProduct),
      priceTypes: types.rows,
      defaultPriceTypeId: settings.rows[0]?.default_price_type_id ?? null,
      syncedAt: new Date().toISOString(),
      dataUpdatedAt: state.rows[0]?.updated_at?.toISOString() ?? null,
      nextCursor: items.rows.length > limit ? rows[rows.length - 1].company_code_key : null,
    })
  } catch {
    return c.json({ error: 'Không đọc được danh mục STORE' }, 503)
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

app.onError((_error, c) => c.json({ error: 'Lỗi máy chủ STORE' }, 500))
export default app
