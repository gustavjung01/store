import type { CatalogSnapshot, ProductRecord, PriceType } from './domain'

type Page = CatalogSnapshot & { nextCursor: string | null }
type AppMember = { role: 'viewer' | 'admin' }

async function authorizedFetch(apiBase: string, path: string, jwt: string): Promise<Response> {
  // Config comes from the PWA build, not from customer input.
  const base = new URL(apiBase.endsWith('/') ? apiBase : apiBase + '/')
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') {
    throw new Error('API STORE phải dùng HTTPS')
  }
  const url = new URL(path.replace(/^\//, ''), base)
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer ' + jwt },
    cache: 'no-store',
    redirect: 'error',
  })
  if (res.status === 401) throw new Error('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại')
  if (res.status === 403) throw new Error('Tài khoản chưa được cấp quyền xem dữ liệu STORE')
  if (!res.ok) throw new Error('API STORE tạm thời không khả dụng (' + res.status + ')')
  return res
}

/** No IndexedDB read before the server verifies a valid member. */
export async function verifyStoreMembership(apiBase: string, jwt: string): Promise<AppMember> {
  const res = await authorizedFetch(apiBase, 'me', jwt)
  const body: unknown = await res.json()
  if (!body || typeof body !== 'object' || !('role' in body)) throw new Error('Phản hồi phân quyền không hợp lệ')
  const role = (body as { role?: unknown }).role
  if (role !== 'viewer' && role !== 'admin') throw new Error('Phân quyền STORE không hợp lệ')
  return { role }
}

function validPage(value: unknown): value is Page {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<Page>
  return Array.isArray(p.products) && Array.isArray(p.priceTypes) &&
    (p.defaultPriceTypeId === null || typeof p.defaultPriceTypeId === 'string') &&
    typeof p.syncedAt === 'string' &&
    (p.nextCursor === null || typeof p.nextCursor === 'string')
}

/** Fetch pages after auth and role verification; fail rather than silently truncate. */
export async function downloadCatalog(apiBase: string, jwt: string): Promise<CatalogSnapshot> {
  const products: ProductRecord[] = []
  let cursor: string | null = null
  let types: PriceType[] = []
  let defaultType: string | null = null
  let syncedAt: string | null = null
  const seen = new Set<string>()
  for (let pageIndex = 0; pageIndex < 200; pageIndex += 1) {
    const query = 'catalog/snapshot?limit=500' + (cursor ? '&after=' + encodeURIComponent(cursor) : '')
    const res = await authorizedFetch(apiBase, query, jwt)
    const body: unknown = await res.json()
    if (!validPage(body)) throw new Error('Dữ liệu trả về từ STORE không đúng cấu trúc')
    // Defensive validation: never persist fabricated or malformed quantities.
    for (const product of body.products) {
      if (typeof product?.companyCode !== 'string' ||
          (product.quantity !== null && (!Number.isInteger(product.quantity) || product.quantity < 0))) {
        throw new Error('Dữ liệu sản phẩm không hợp lệ')
      }
      products.push(product)
    }
    types = body.priceTypes
    defaultType = body.defaultPriceTypeId
    syncedAt = body.syncedAt
    if (!body.nextCursor) return { products, priceTypes: types, defaultPriceTypeId: defaultType, syncedAt }
    if (seen.has(body.nextCursor)) throw new Error('Phân trang danh mục lặp')
    seen.add(body.nextCursor)
    cursor = body.nextCursor
  }
  throw new Error('Danh mục quá lớn; cần đồng bộ phân trang nâng cao')
}
