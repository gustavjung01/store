/** Structured STORE product facts. Never infer carton quantities or stock units from names. */
export type ProductSpec = {
  paperSize: string | null
  pages: number | null
  ruling: string | null
  gsm: number | null
  coverType: string | null
  pieceUnit: string | null
  packUnit: string | null
  unitsPerPack: number | null
  packsPerCarton: number | null
  unitsPerCarton: number | null
  packagingNote: string | null
}

export const emptyProductSpec: ProductSpec = {
  paperSize: null,
  pages: null,
  ruling: null,
  gsm: null,
  coverType: null,
  pieceUnit: null,
  packUnit: null,
  unitsPerPack: null,
  packsPerCarton: null,
  unitsPerCarton: null,
  packagingNote: null,
}

const textLimits = {
  paperSize: 60,
  ruling: 120,
  coverType: 120,
  pieceUnit: 40,
  packUnit: 40,
  packagingNote: 300,
} as const
const integerLimits = {
  pages: 10000,
  gsm: 2000,
  unitsPerPack: 100000,
  packsPerCarton: 100000,
  unitsPerCarton: 100000000,
} as const

export const productSpecKeys = Object.keys(emptyProductSpec) as (keyof ProductSpec)[]

export class SpecValidationError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Import: only explicitly supplied nonblank keys participate; skipped columns never erase data. */
export function validateSpecPatch(raw: unknown): Partial<ProductSpec> {
  if (!isRecord(raw)) throw new SpecValidationError('Quy cách phải là một đối tượng')
  const result: Record<string, string | number | null> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!productSpecKeys.includes(key as keyof ProductSpec)) {
      throw new SpecValidationError('Trường quy cách không được hỗ trợ: ' + key)
    }
    if (value === undefined) continue
    if (value === null || value === '') { result[key] = null; continue }
    if (key in textLimits) {
      if (typeof value !== 'string') throw new SpecValidationError(key + ' phải là văn bản')
      const text = value.trim()
      if (text.length > textLimits[key as keyof typeof textLimits] || /[\x00-\x1f\x7f]/.test(text)) {
        throw new SpecValidationError(key + ' có ký tự hoặc độ dài không hợp lệ')
      }
      result[key] = text || null
    } else {
      const limit = integerLimits[key as keyof typeof integerLimits]
      const number = typeof value === 'number' ? value :
        typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN
      if (!Number.isSafeInteger(number) || number <= 0 || number > limit) {
        throw new SpecValidationError(key + ' phải là số nguyên dương không vượt quá ' + limit)
      }
      result[key] = number
    }
  }
  return result as Partial<ProductSpec>
}

/** Full product validation after merging an import patch with current, real product facts. */
export function normalizeProductSpec(raw: unknown): ProductSpec {
  const patch = raw === null || raw === undefined ? {} : validateSpecPatch(raw)
  const spec: ProductSpec = { ...emptyProductSpec, ...patch }
  if (spec.unitsPerPack !== null && (!spec.pieceUnit || !spec.packUnit)) {
    throw new SpecValidationError('Số sản phẩm/lốc-hộp cần ĐVT lẻ và tên đơn vị đóng gói')
  }
  if (spec.packsPerCarton !== null && !spec.packUnit) {
    throw new SpecValidationError('Số lốc-hộp/thùng cần tên đơn vị đóng gói')
  }
  if (spec.unitsPerCarton !== null && !spec.pieceUnit) {
    throw new SpecValidationError('Số sản phẩm/thùng cần đơn vị sản phẩm lẻ (quyển/cái...)')
  }
  if (spec.unitsPerPack !== null && spec.packsPerCarton !== null && spec.unitsPerCarton !== null &&
      spec.unitsPerPack * spec.packsPerCarton !== spec.unitsPerCarton) {
    throw new SpecValidationError('Quy cách mâu thuẫn: sản phẩm/lốc × lốc/thùng không bằng sản phẩm/thùng')
  }
  return spec
}

export function safeProductSpec(raw: unknown): ProductSpec {
  try { return normalizeProductSpec(raw) }
  catch { return { ...emptyProductSpec } }
}

/** We derive only from verified pack sizes, without persisting an invented conversion. */
export function piecesPerCarton(spec: ProductSpec): number | null {
  if (spec.unitsPerCarton !== null) return spec.unitsPerCarton
  if (spec.unitsPerPack !== null && spec.packsPerCarton !== null) {
    const amount = spec.unitsPerPack * spec.packsPerCarton
    return Number.isSafeInteger(amount) && amount <= integerLimits.unitsPerCarton ? amount : null
  }
  return null
}

export function wholesaleConversion(
  quantity: number | null | undefined,
  unit: string | null | undefined,
  spec: ProductSpec,
): { piecesPerCarton: number | null; totalPieces: number | null; fullCartons: number | null; remainder: number | null } {
  const carton = piecesPerCarton(spec)
  if (carton === null || !spec.pieceUnit || quantity === null || quantity === undefined ||
      !Number.isSafeInteger(quantity) || quantity < 0) {
    return { piecesPerCarton: carton, totalPieces: null, fullCartons: null, remainder: null }
  }
  const stockUnit = unit?.trim().toLocaleLowerCase('vi') ?? ''
  if (stockUnit === 'thùng' || stockUnit === 'thung') {
    const pieces = quantity * carton
    return { piecesPerCarton: carton, totalPieces: Number.isSafeInteger(pieces) ? pieces : null, fullCartons: null, remainder: null }
  }
  if (stockUnit && stockUnit === spec.pieceUnit.trim().toLocaleLowerCase('vi')) {
    return { piecesPerCarton: carton, totalPieces: null, fullCartons: Math.floor(quantity / carton), remainder: quantity % carton }
  }
  return { piecesPerCarton: carton, totalPieces: null, fullCartons: null, remainder: null }
}
