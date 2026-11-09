import { priceIdFromHeader, validateImport } from '../server/importValidation.ts'
import type { ImportKind, ImportPayload, ImportIssue } from '../server/importValidation'

export type ExcelCell = string | number | boolean | Date | null | undefined
export type ExcelSheet = { sheet: string; data: ExcelCell[][] }
export type ColumnSelection = {
  code: number
  quantity: number
  name: number
  sku: number
  unit: number
  prices: number[]
  defaultPriceColumn: number
}

export function columnHeader(data: ExcelCell[][], headerRow: number, column: number): string {
  const cell = data[headerRow - 1]?.[column]
  return typeof cell === 'string' && cell.trim() ? cell.trim() : 'Cột ' + (column + 1)
}

export function buildMappedImport(
  sheet: ExcelSheet,
  headerRow: number,
  select: ColumnSelection,
  kind: ImportKind,
  filename: string,
): { payload: ImportPayload | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow >= sheet.data.length) {
    return { payload: null, issues: [{ rowNumber: 0, message: 'Chọn dòng tiêu đề hợp lệ' }] }
  }
  if (select.code < 0 || (kind === 'inventory' && select.quantity < 0)) {
    return { payload: null, issues: [{ rowNumber: 0, message: 'Cần chọn cột mã CTY và số tồn' }] }
  }
  if (kind === 'catalog' && !select.prices.length && select.name < 0 && select.sku < 0 && select.unit < 0) {
    return { payload: null, issues: [{ rowNumber: 0, message: 'Chọn ít nhất tên, SKU, ĐVT hoặc một cột giá' }] }
  }
  const fields = [select.code, ...(kind === 'inventory'
    ? [select.quantity]
    : [select.name, select.sku, select.unit, ...select.prices])].filter(x => x >= 0)
  if (new Set(fields).size !== fields.length) {
    return { payload: null, issues: [{ rowNumber: 0, message: 'Một cột Excel không được mapping vào nhiều trường' }] }
  }
  const priceTypes = select.prices.map(i => ({
    id: priceIdFromHeader(columnHeader(sheet.data, headerRow, i)),
    label: columnHeader(sheet.data, headerRow, i),
  }))
  if (priceTypes.some(p => !p.id) || new Set(priceTypes.map(p => p.id)).size !== priceTypes.length) {
    return { payload: null, issues: [{ rowNumber: 0, message: 'Tên cột giá bị trùng hoặc không có ký tự hợp lệ' }] }
  }
  const rows: Record<string, unknown>[] = []
  for (let i = headerRow; i < sheet.data.length; i++) {
    const cells = sheet.data[i] ?? []
    if (cells.every(cell => cell === null || cell === undefined || cell === '')) continue
    const rowNo = i + 1
    const code = cells[select.code]
    if (typeof code === 'number') {
      issues.push({ rowNumber: rowNo, message: 'Mã CTY đang là kiểu số trong Excel, có thể đã mất số 0 đầu. Chuyển cột thành Text và xuất lại file.' })
      continue
    }
    if (typeof code !== 'string') {
      issues.push({ rowNumber: rowNo, message: 'Mã CTY phải là ô văn bản' })
      continue
    }
    const row: Record<string, unknown> = { rowNumber: rowNo, companyCode: code }
    if (kind === 'inventory') {
      row.quantity = cells[select.quantity] ?? null
    } else {
      if (select.name >= 0) row.name = cells[select.name] ?? null
      if (select.sku >= 0) row.sku = cells[select.sku] ?? null
      if (select.unit >= 0) row.unit = cells[select.unit] ?? null
      const prices: Record<string,unknown> = {}
      for (const col of select.prices) {
        const labelId = priceIdFromHeader(columnHeader(sheet.data,headerRow,col))
        const value = cells[col]
        if (value !== null && value !== undefined && value !== '') prices[labelId] = value
      }
      row.prices = prices
    }
    rows.push(row)
  }
  if (issues.length) return { payload: null, issues: issues.slice(0,100) }
  const defaultId = kind === 'catalog' && select.defaultPriceColumn >= 0
    ? priceIdFromHeader(columnHeader(sheet.data,headerRow,select.defaultPriceColumn))
    : null
  return validateImport({
    kind, filename, sheet: sheet.sheet, priceTypes: kind === 'catalog' ? priceTypes : [],
    defaultPriceTypeId: defaultId, rows,
  })
}
