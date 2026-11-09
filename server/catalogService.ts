import type { Pool } from 'pg'
import { normalizedCode } from './importValidation.ts'
import { normalizeProductSpec } from '../src/productSpec.ts'
import type { ProductSpec } from '../src/productSpec.ts'

export type ProductInput = {
  companyCode: string
  name: string
  sku: string | null
  unit: string | null
  category: string | null
  productSpec?: ProductSpec
  expectedVersion: string
}

export class CatalogError extends Error {
  readonly status: number
  constructor(message: string, status = 400) { super(message); this.status = status }
}

function inputText(value: unknown, limit: number, field: string, required: boolean): string | null {
  if (typeof value !== 'string') {
    if (required || (value !== null && value !== undefined)) throw new CatalogError(field + ' phải là văn bản')
    return null
  }
  const text = value.trim()
  if (required && !text) throw new CatalogError(field + ' không được để trống')
  if (text.length > limit || /[\x00-\x1f\x7f]/.test(text)) {
    throw new CatalogError(field + ' có ký tự hoặc độ dài không hợp lệ')
  }
  return text || null
}

/** Normalize on server, preserving zero-prefix; no generated names or identifiers. */
export function validateProductInput(input: unknown): ProductInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CatalogError('Thông tin sản phẩm không hợp lệ')
  const data = input as Record<string, unknown>
  const rawCode = inputText(data.companyCode, 120, 'Mã CTY', true)!
  const code = normalizedCode(rawCode)
  if (!code || code.length > 120) throw new CatalogError('Mã CTY không hợp lệ')
  const name = inputText(data.name, 400, 'Tên hàng', true)!
  const sku = inputText(data.sku, 120, 'SKU', false)
  const unit = inputText(data.unit, 60, 'Đơn vị tính', false)
  const category = inputText(data.category, 120, 'Nhóm hàng', false)
  let productSpec: ProductSpec | undefined
  if (Object.prototype.hasOwnProperty.call(data, 'productSpec')) {
    try { productSpec = normalizeProductSpec(data.productSpec) }
    catch (error) { throw new CatalogError(error instanceof Error ? error.message : 'Quy cách không hợp lệ') }
  }
  const version = data.expectedVersion
  if (typeof version !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(version)) {
    throw new CatalogError('Vui lòng đồng bộ danh mục trước khi lưu', 409)
  }
  return { companyCode: code, name, sku, unit, category, productSpec, expectedVersion: version }
}

export async function saveCatalogProduct(
  pool: Pool,
  actor: string,
  raw: unknown,
  mode: 'create' | 'update',
  routeCode?: string,
) {
  const input = validateProductInput(raw)
  if (mode === 'update' && (!routeCode || normalizedCode(routeCode) !== input.companyCode)) {
    throw new CatalogError('Không được thay mã CTY khi sửa sản phẩm', 409)
  }

  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    const latest = await db.query<{ version: string }>(
      'SELECT version::text FROM public.catalog_state WHERE id=1 FOR UPDATE',
    )
    if (!latest.rows[0] || latest.rows[0].version !== input.expectedVersion) {
      throw new CatalogError('Danh mục đã thay đổi. Đồng bộ lại rồi mới sửa', 409)
    }
    const found = await db.query<{
      id: string
      company_code: string
      name: string | null
      sku: string | null
      unit: string | null
      category: string | null
      product_spec: ProductSpec
    }>(
      'SELECT id,company_code,name,sku,unit,category,product_spec FROM public.products WHERE company_code_key=$1 FOR UPDATE',
      [input.companyCode],
    )
    const previous = found.rows[0] ?? null
    if (mode === 'create' && previous) {
      throw new CatalogError('Mã CTY đã có. Chọn sản phẩm này để hoàn thiện hoặc sửa tên hàng', 409)
    }
    if (mode === 'update' && !previous) {
      throw new CatalogError('Không tìm thấy mã CTY. Vui lòng đồng bộ danh mục', 404)
    }

    let productId: string
    if (mode === 'create') {
      const created = await db.query<{ id: string }>(
        `INSERT INTO public.products(company_code,name,sku,unit,category,product_spec)
         VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`,
        [input.companyCode,input.name,input.sku,input.unit,input.category,JSON.stringify(input.productSpec ?? {})],
      )
      productId = created.rows[0].id
    } else {
      productId = previous!.id
      await db.query(
        `UPDATE public.products SET name=$2,sku=$3,unit=$4,category=$5,
           product_spec=COALESCE($6::jsonb,product_spec),updated_at=now()
         WHERE id=$1`,
        [productId,input.name,input.sku,input.unit,input.category,
          input.productSpec ? JSON.stringify(input.productSpec) : null],
      )
    }

    const auditBefore = previous ? {
      companyCode: previous.company_code, name: previous.name, sku: previous.sku,
      unit: previous.unit, category: previous.category, productSpec: previous.product_spec,
    } : null
    const auditAfter = {
      companyCode: input.companyCode, name: input.name, sku: input.sku,
      unit: input.unit, category: input.category,
      productSpec: input.productSpec ?? previous?.product_spec ?? {},
    }
    const next = await db.query<{ version: string }>(
      'UPDATE public.catalog_state SET version=version+1,updated_at=now() WHERE id=1 RETURNING version::text',
    )
    await db.query(
      `INSERT INTO public.catalog_edits
       (product_id,company_code,action,before_data,after_data,edited_by,catalog_version)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
      [productId,input.companyCode,mode,
        auditBefore ? JSON.stringify(auditBefore) : null, JSON.stringify(auditAfter),
        actor,next.rows[0].version],
    )
    await db.query('COMMIT')
    return { success: true, version: next.rows[0].version, product: auditAfter }
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {})
    if (err instanceof CatalogError) throw err
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      throw new CatalogError('Mã CTY trùng với sản phẩm đã có', 409)
    }
    throw new CatalogError('Không thể lưu danh mục vào database STORE', 503)
  } finally {
    db.release()
  }
}

export async function recentCatalogEdits(pool: Pool) {
  const rows = await pool.query(
    `SELECT id,company_code,action,edited_by,created_at,catalog_version,
            before_data,after_data
     FROM public.catalog_edits ORDER BY created_at DESC,id DESC LIMIT 20`,
  )
  return { edits: rows.rows }
}
