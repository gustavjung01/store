import type { ProductRecord } from './domain'
import { safeProductSpec } from './productSpec'

export type ProductFact = { key: string; label: string; value: string | null }
export type ProductFactGroup = { key: string; title: string; facts: ProductFact[] }

function textValue(value: string | null | undefined): string | null {
  return typeof value === 'string' ? value.trim() || null : null
}

function numberValue(value: number | null | undefined, suffix = ''): string | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value.toLocaleString('vi-VN') + suffix
    : null
}

/** Every supported field has a stable label; missing data is never inferred from product names. */
export function productFactGroups(product: ProductRecord): ProductFactGroup[] {
  const spec = safeProductSpec(product.productSpec)
  return [
    {
      key: 'general', title: 'Thông tin bổ sung', facts: [
        { key: 'sku', label: 'SKU', value: textValue(product.sku) },
        { key: 'category', label: 'Nhóm hàng', value: textValue(product.category) },
      ],
    },
    {
      key: 'technical', title: 'Thông số sản phẩm', facts: [
        { key: 'paperSize', label: 'Khổ giấy', value: textValue(spec.paperSize) },
        { key: 'pages', label: 'Số trang', value: numberValue(spec.pages, ' trang') },
        { key: 'gsm', label: 'Định lượng giấy', value: numberValue(spec.gsm, ' GSM') },
        { key: 'ruling', label: 'Dòng kẻ', value: textValue(spec.ruling) },
        { key: 'coverType', label: 'Loại bìa', value: textValue(spec.coverType) },
      ],
    },
    {
      key: 'packaging', title: 'Quy cách đóng gói', facts: [
        { key: 'pieceUnit', label: 'Đơn vị sản phẩm lẻ', value: textValue(spec.pieceUnit) },
        { key: 'unitsPerCarton', label: 'Sản phẩm / thùng', value: numberValue(spec.unitsPerCarton) },
        { key: 'packUnit', label: 'Đơn vị đóng gói', value: textValue(spec.packUnit) },
        { key: 'unitsPerPack', label: 'Sản phẩm / lốc, hộp', value: numberValue(spec.unitsPerPack) },
        { key: 'packsPerCarton', label: 'Lốc, hộp / thùng', value: numberValue(spec.packsPerCarton) },
        { key: 'packagingNote', label: 'Ghi chú đóng gói', value: textValue(spec.packagingNote) },
      ],
    },
  ]
}

export function knownProductFactCount(groups: readonly ProductFactGroup[]): number {
  return groups.reduce((total, group) => total + group.facts.filter(fact => fact.value !== null).length, 0)
}
