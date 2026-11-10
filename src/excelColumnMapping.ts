import type { ImportKind } from '../server/importValidation.ts'
import type { ProductSpec } from './productSpec'
import type { ColumnSelection, ExcelSheet } from './excelImportMapping'

export type ColumnTarget =
  | 'skip' | 'code' | 'quantity' | 'name' | 'sku' | 'unit' | 'price'
  | `spec:${keyof ProductSpec}`

export const catalogColumns: Array<{ value: ColumnTarget; label: string }> = [
  { value: 'code', label: 'Mã CTY' },
  { value: 'name', label: 'Tên hàng' },
  { value: 'sku', label: 'SKU' },
  { value: 'unit', label: 'Đơn vị tính' },
  { value: 'spec:pieceUnit', label: 'ĐVT sản phẩm lẻ' },
  { value: 'spec:unitsPerCarton', label: 'Sản phẩm / thùng' },
  { value: 'spec:packUnit', label: 'Đơn vị đóng gói' },
  { value: 'spec:unitsPerPack', label: 'Sản phẩm / lốc, hộp' },
  { value: 'spec:packsPerCarton', label: 'Lốc, hộp / thùng' },
  { value: 'spec:paperSize', label: 'Khổ giấy' },
  { value: 'spec:pages', label: 'Số trang' },
  { value: 'spec:gsm', label: 'GSM' },
  { value: 'spec:ruling', label: 'Dòng kẻ' },
  { value: 'spec:coverType', label: 'Loại bìa' },
  { value: 'spec:packagingNote', label: 'Ghi chú đóng gói' },
  { value: 'price', label: 'Giá (theo tên cột Excel)' },
]

export const inventoryColumns: Array<{ value: ColumnTarget; label: string }> = [
  { value: 'code', label: 'Mã CTY' },
  { value: 'quantity', label: 'Số tồn' },
]

export function emptyMapping(defaultUnitForNew: string | null = 'Thùng'): ColumnSelection {
  return { code: -1, quantity: -1, name: -1, sku: -1, unit: -1,
    specColumns: {}, prices: [], defaultPriceColumn: -1, defaultUnitForNew }
}

export function targetForColumn(mapping: ColumnSelection, column: number, kind: ImportKind): ColumnTarget {
  if (mapping.code === column) return 'code'
  if (kind === 'inventory') return mapping.quantity === column ? 'quantity' : 'skip'
  for (const field of ['name','sku','unit'] as const) if (mapping[field] === column) return field
  for (const [field, index] of Object.entries(mapping.specColumns ?? {})) {
    if (index === column) return `spec:${field}` as ColumnTarget
  }
  return mapping.prices.includes(column) ? 'price' : 'skip'
}

/** A source column may feed ONE target only, and each non-price target at most one column. */
export function mapColumn(
  old: ColumnSelection, column: number, target: ColumnTarget, kind: ImportKind,
): ColumnSelection {
  const next: ColumnSelection = {
    ...old, prices: old.prices.filter(index => index !== column),
    specColumns: { ...old.specColumns },
    defaultPriceColumn: old.defaultPriceColumn === column ? -1 : old.defaultPriceColumn,
  }
  for (const field of ['code','quantity','name','sku','unit'] as const) {
    if (next[field] === column) next[field] = -1
  }
  for (const [field,index] of Object.entries(next.specColumns ?? {})) {
    if (index === column) next.specColumns![field as keyof ProductSpec] = -1
  }
  if (target === 'skip') return next
  if (target === 'code') { next.code = column; return next }
  if (kind === 'inventory') {
    if (target === 'quantity') next.quantity = column
    return next
  }
  if (target === 'price') { next.prices.push(column); next.prices.sort((a,b) => a-b); return next }
  if (target === 'name' || target === 'sku' || target === 'unit') {
    next[target] = column
    return next
  }
  if (target.startsWith('spec:')) {
    next.specColumns![target.slice(5) as keyof ProductSpec] = column
  }
  return next
}

function normalizeHeader(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g,' ')
}

const headerAliases: Record<string, ColumnTarget> = {
  'ma cty': 'code', 'ma cong ty': 'code', 'ma hang': 'code', 'ma san pham': 'code',
  'ma sp': 'code', 'company code': 'code',
  'ten hang': 'name', 'ten san pham': 'name', 'ten sp': 'name', 'ten hang hoa': 'name',
  'ten xnt nguyen van': 'name',
  'sku': 'sku',
  'dvt': 'unit', 'don vi tinh': 'unit', 'dvt ton kho': 'unit',
  'don vi tinh ton kho': 'unit',
  'ton': 'quantity', 'ton kho': 'quantity', 'so ton': 'quantity',
  'sl ton': 'quantity', 'so luong ton': 'quantity',
  'ton xnt thung': 'quantity', 'so ton kho': 'quantity',
  'dvt san pham le': 'spec:pieceUnit', 'don vi san pham le': 'spec:pieceUnit',
  'so san pham thung': 'spec:unitsPerCarton', 'san pham thung': 'spec:unitsPerCarton',
  'don vi dong goi': 'spec:packUnit', 'don vi dong goi loc hop': 'spec:packUnit',
  'san pham loc': 'spec:unitsPerPack', 'san pham loc hop': 'spec:unitsPerPack',
  'so san pham loc hop': 'spec:unitsPerPack',
  'so loc thung': 'spec:packsPerCarton', 'so loc hop thung': 'spec:packsPerCarton',
  'kho': 'spec:paperSize', 'kho giay': 'spec:paperSize',
  'so trang': 'spec:pages', 'trang': 'spec:pages',
  'gsm': 'spec:gsm', 'dinh luong': 'spec:gsm', 'dinh luong gsm': 'spec:gsm',
  'dong ke': 'spec:ruling', 'loai ke': 'spec:ruling',
  'loai bia': 'spec:coverType', 'bia': 'spec:coverType',
  'ghi chu dong goi': 'spec:packagingNote',
}

/** Only unambiguous, recognized headers are mapped. In particular PRICES stay opt-in. */
export function suggestMapping(sheet: ExcelSheet, headerRow: number, kind: ImportKind): ColumnSelection {
  let mapping = emptyMapping()
  const headers = sheet.data[headerRow - 1] ?? []
  for (let column = 0; column < headers.length; column++) {
    const key = normalizeHeader(headers[column])
    const target = headerAliases[key]
    if (!target || target === 'price') continue
    if (kind === 'inventory' && target !== 'code' && target !== 'quantity') continue
    if (kind === 'catalog' && target === 'quantity') continue
    // Never automatically resolve ambiguous duplicate headers by picking the last one.
    if (Object.entries(headerAliases).some(([alias,t]) => alias !== key && t === target && normalizeHeader(alias) === key)) continue
    const alreadyAssigned = target === 'code' ? mapping.code >= 0 :
      target === 'quantity' ? mapping.quantity >= 0 :
      target === 'name' || target === 'sku' || target === 'unit' ? mapping[target] >= 0 :
      target.startsWith('spec:') ? (mapping.specColumns?.[target.slice(5) as keyof ProductSpec] ?? -1) >= 0 : false
    if (!alreadyAssigned) mapping = mapColumn(mapping, column, target, kind)
  }
  return mapping
}
