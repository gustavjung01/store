import { validateSpecPatch } from '../src/productSpec.ts'
import type { ProductSpec } from '../src/productSpec.ts'

/** Strict server-side validation. Never trust XLSX mappings or numbers from the browser. */
export type ImportKind = 'inventory' | 'catalog'
export type PriceDefinition = { id: string; label: string }
export type ImportRow = {
  rowNumber: number
  companyCode: string
  quantity?: number
  name?: string | null
  sku?: string | null
  unit?: string | null
  productSpec?: Partial<ProductSpec>
  prices?: Record<string, number>
}
export type ImportPayload = {
  kind: ImportKind
  filename: string
  sheet: string
  priceTypes: PriceDefinition[]
  defaultPriceTypeId: string | null
  defaultUnitForNew: string | null
  rows: ImportRow[]
}
export type ImportIssue = { rowNumber: number; message: string }

export class ImportFailure extends Error {
  readonly status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export function normalizedCode(raw: string): string {
  return raw.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toUpperCase()
}

function cleanText(raw: unknown, max: number, row: number, field: string, issues: ImportIssue[]): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string') {
    issues.push({ rowNumber: row, message: field + ': cần định dạng ô là văn bản để giữ số 0 đầu' })
    return null
  }
  const value = raw.trim()
  if (!value) return null
  if (value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) {
    issues.push({ rowNumber: row, message: field + ': ký tự hoặc độ dài không hợp lệ' })
    return null
  }
  return value
}

export function nonNegativeInteger(raw: unknown, upper: number): number | null {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw >= 0 && raw <= upper ? raw : null
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(text)) return null
  const n = Number(text.replace(/[.,]/g, ''))
  return Number.isSafeInteger(n) && n >= 0 && n <= upper ? n : null
}

export function priceIdFromHeader(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64)
}

export function validateImport(raw: unknown): { payload: ImportPayload | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  if (!raw || typeof raw !== 'object') return { payload: null, issues: [{ rowNumber: 0, message: 'Dữ liệu import không hợp lệ' }] }
  const data = raw as Record<string, unknown>
  if (data.kind !== 'inventory' && data.kind !== 'catalog') issues.push({ rowNumber: 0, message: 'Chọn nhập tồn hoặc danh mục' })
  const kind = data.kind === 'catalog' ? 'catalog' : 'inventory'
  const filename = cleanText(data.filename, 180, 0, 'Tên file', issues)
  if (!filename || !/\.xlsx$/i.test(filename)) issues.push({ rowNumber: 0, message: 'Chỉ chấp nhận .xlsx' })
  const sheet = cleanText(data.sheet, 80, 0, 'Sheet', issues)
  if (!sheet) issues.push({ rowNumber: 0, message: 'Thiếu tên sheet' })
  const priceTypes: PriceDefinition[] = []
  if (kind === 'catalog') {
    if (!Array.isArray(data.priceTypes) || data.priceTypes.length > 40) {
      issues.push({ rowNumber: 0, message: 'Danh sách loại giá không hợp lệ' })
    } else {
      const used = new Set<string>()
      for (const item of data.priceTypes as unknown[]) {
        const obj = item && typeof item === 'object' ? item as Record<string,unknown> : {}
        const id = typeof obj.id === 'string' ? obj.id : ''
        const label = cleanText(obj.label, 80, 0, 'Tên loại giá', issues)
        if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) || !label || used.has(id)) {
          issues.push({ rowNumber: 0, message: 'Loại giá thiếu tên, sai ID hoặc bị trùng' })
        } else {
          priceTypes.push({ id, label })
          used.add(id)
        }
      }
    }
  }
  const defaultId = data.defaultPriceTypeId === null || data.defaultPriceTypeId === undefined || data.defaultPriceTypeId === ''
    ? null : typeof data.defaultPriceTypeId === 'string' ? data.defaultPriceTypeId : ''
  if (defaultId === '') issues.push({ rowNumber: 0, message: 'Loại giá mặc định không hợp lệ' })
  if (kind === 'catalog' && defaultId && !priceTypes.some(p => p.id === defaultId)) {
    issues.push({ rowNumber: 0, message: 'Giá mặc định phải nằm trong các cột giá được chọn' })
  }
  const defaultUnitForNew = kind === 'catalog'
    ? cleanText(data.defaultUnitForNew, 60, 0, 'ĐVT mặc định cho mã mới', issues) : null
  if (!Array.isArray(data.rows) || data.rows.length < 1 || data.rows.length > 3000) {
    issues.push({ rowNumber: 0, message: 'Cần từ 1 đến 3000 dòng mỗi lượt import' })
    return { payload: null, issues }
  }
  const rows: ImportRow[] = []
  const seen = new Set<string>()
  for (const rawRow of data.rows as unknown[]) {
    if (!rawRow || typeof rawRow !== 'object') { issues.push({ rowNumber: 0, message: 'Dòng không hợp lệ' }); continue }
    const r = rawRow as Record<string, unknown>
    const num = typeof r.rowNumber === 'number' && Number.isSafeInteger(r.rowNumber) && r.rowNumber > 0 ? r.rowNumber : 0
    if (!num) issues.push({ rowNumber: 0, message: 'Thiếu số dòng Excel' })
    const code = cleanText(r.companyCode, 120, num, 'Mã CTY', issues)
    if (!code) { issues.push({ rowNumber: num, message: 'Thiếu mã CTY' }); continue }
    const key = normalizedCode(code)
    if (!key) { issues.push({ rowNumber: num, message: 'Mã CTY trống' }); continue }
    if (seen.has(key)) { issues.push({ rowNumber: num, message: 'Mã CTY trùng trong file: ' + code }); continue }
    seen.add(key)
    const row: ImportRow = { rowNumber: num, companyCode: key }
    if (kind === 'inventory') {
      const quantity = nonNegativeInteger(r.quantity, 2147483647)
      if (quantity === null) issues.push({ rowNumber: num, message: 'Tồn phải là số nguyên không âm, ô trống không phải 0' })
      else row.quantity = quantity
    } else {
      row.name = cleanText(r.name, 400, num, 'Tên hàng', issues)
      row.sku = cleanText(r.sku, 120, num, 'SKU', issues)
      row.unit = cleanText(r.unit, 60, num, 'ĐVT', issues)
      if (r.productSpec !== undefined) {
        try {
          const patch = validateSpecPatch(r.productSpec)
          const supplied = Object.fromEntries(Object.entries(patch).filter(([,value]) => value !== null))
          if (Object.keys(supplied).length > 0) row.productSpec = supplied as Partial<ProductSpec>
        } catch (cause) {
          issues.push({ rowNumber: num, message: cause instanceof Error ? cause.message : 'Quy cách không hợp lệ' })
        }
      }
      const rawPrices = r.prices && typeof r.prices === 'object' && !Array.isArray(r.prices) ? r.prices as Record<string, unknown> : {}
      row.prices = {}
      for (const id of Object.keys(rawPrices)) {
        if (!priceTypes.some(p => p.id === id)) { issues.push({ rowNumber: num, message: 'Loại giá không nằm trong mapping: ' + id }); continue }
        if (rawPrices[id] === '' || rawPrices[id] === null || rawPrices[id] === undefined) continue
        const n = nonNegativeInteger(rawPrices[id], 999999999999999)
        if (n === null) issues.push({ rowNumber: num, message: 'Giá ' + id + ' sai định dạng hoặc âm' })
        else row.prices[id] = n
      }
    }
    rows.push(row)
  }
  if (issues.length) return { payload: null, issues: issues.slice(0, 100) }
  return {
    issues: [],
    payload: {
      kind,
      filename: filename!,
      sheet: sheet!,
      priceTypes,
      defaultPriceTypeId: kind === 'catalog' ? defaultId : null,
      defaultUnitForNew,
      rows,
    },
  }
}
