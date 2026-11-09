/** Convert database rows into the STORE frontend snapshot contract. */
export interface DatabaseCatalogRow {
  company_code: string
  sku: string | null
  name: string | null
  unit: string | null
  category: string | null
  image_url: string | null
  quantity: number | null
  inventory_updated_at: Date | string | null
  price_map: Record<string, unknown> | null
  company_code_key: string
}

export function toProduct(row: DatabaseCatalogRow) {
  const prices: Record<string, number | null> = {}
  for (const [type, raw] of Object.entries(row.price_map ?? {})) {
    if (raw === null) {
      prices[type] = null
      continue
    }
    const price = Number(raw)
    prices[type] = Number.isSafeInteger(price) && price >= 0 ? price : null
  }
  return {
    companyCode: row.company_code,
    sku: row.sku,
    name: row.name,
    unit: row.unit,
    category: row.category,
    imageUrl: row.image_url,
    quantity: row.quantity,
    inventoryUpdatedAt: row.inventory_updated_at ? new Date(row.inventory_updated_at).toISOString() : null,
    prices,
  }
}

export function codeKey(code: string): string {
  return code.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLocaleUpperCase('vi')
}

export function parsePageLimit(input: string | undefined): number {
  if (!input) return 250
  if (!/^[0-9]{1,3}$/.test(input)) throw new Error('limit không hợp lệ')
  const value = Number(input)
  if (value < 1 || value > 500) throw new Error('limit phải từ 1 đến 500')
  return value
}
