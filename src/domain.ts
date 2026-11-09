/** Shared STORE display rules. No fake products, prices, or quantities. */
export interface PriceType {
  id: string
  label: string
}

export interface ProductRecord {
  companyCode: string
  sku: string | null
  name: string | null
  unit: string | null
  category?: string | null
  imageUrl: string | null
  quantity: number | null
  inventoryUpdatedAt: string | null
  prices: Record<string, number | null>
}

export interface CatalogSnapshot {
  products: ProductRecord[]
  priceTypes: PriceType[]
  defaultPriceTypeId: string | null
  syncedAt: string | null
  version?: string | null
}

export function emptySnapshot(): CatalogSnapshot {
  return { products: [], priceTypes: [], defaultPriceTypeId: null, syncedAt: null, version: null }
}

export function normalizeCode(value: string): string {
  // Preserve leading zeros; never parse company codes as numbers.
  return value.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLocaleUpperCase('vi')
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleUpperCase('vi')
}

export function findProducts(products: readonly ProductRecord[], query: string, max = 12): ProductRecord[] {
  const code = normalizeCode(query)
  if (!code || max <= 0) return []
  const text = normalizeSearch(query)
  const exact = products.filter((item) => normalizeCode(item.companyCode) === code)
  const skuExact = products.filter((item) => normalizeCode(item.companyCode) !== code && item.sku && normalizeCode(item.sku) === code)
  const other = products.filter((item) =>
    normalizeCode(item.companyCode) !== code &&
    !(item.sku && normalizeCode(item.sku) === code) &&
    (normalizeCode(item.companyCode).includes(code) ||
      (item.sku ? normalizeCode(item.sku).includes(code) : false) ||
      (item.name ? normalizeSearch(item.name).includes(text) : false))
  )
  return [...exact, ...skuExact, ...other].slice(0, max)
}

export type StockState = 'available' | 'empty' | 'unknown'
export function stockState(quantity: number | null | undefined): StockState {
  if (quantity === null || quantity === undefined || !Number.isFinite(quantity) || quantity < 0) return 'unknown'
  return quantity === 0 ? 'empty' : 'available'
}

export function priceFor(product: ProductRecord, priceTypeId: string | null): number | null {
  if (!priceTypeId) return null
  const value = product.prices[priceTypeId]
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function formatVnd(price: number | null): string {
  return price === null ? 'Chưa có giá' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(price)
}

export function formatDate(value: string | null): string {
  if (!value) return 'Chưa cập nhật'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(d)
}
