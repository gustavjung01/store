import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyProductSpec, normalizeProductSpec, validateSpecPatch, piecesPerCarton, wholesaleConversion,
} from '../src/productSpec.ts'
import { validateProductInput } from '../server/catalogService.ts'

test('unknown packaging does not invent carton sizes or stock conversions', () => {
  const spec = normalizeProductSpec({})
  assert.deepEqual(spec, emptyProductSpec)
  assert.equal(piecesPerCarton(spec), null)
  assert.equal(wholesaleConversion(15, 'Thùng', spec).totalPieces, null)
  assert.equal(wholesaleConversion(15, null, spec).fullCartons, null)
})

test('verified 10 units/pack and 12 packs/carton yields 120 units/carton', () => {
  const spec = normalizeProductSpec({
    pieceUnit: 'quyển', packUnit: 'lốc', unitsPerPack: 10, packsPerCarton: 12,
    paperSize: 'A4', pages: 96, gsm: 70,
  })
  assert.equal(piecesPerCarton(spec), 120)
  assert.equal(wholesaleConversion(8, 'Thùng', spec).totalPieces, 960)
  const loose = wholesaleConversion(245, 'quyển', spec)
  assert.equal(loose.fullCartons, 2)
  assert.equal(loose.remainder, 5)
  assert.equal(wholesaleConversion(8, 'Hộp', spec).totalPieces, null)
})

test('direct 1-carton conversion is used only when both quantity and loose unit exist', () => {
  const spec = normalizeProductSpec({ pieceUnit: 'cái', unitsPerCarton: 24 })
  assert.equal(piecesPerCarton(spec), 24)
  assert.equal(wholesaleConversion(5, 'thùng', spec).totalPieces, 120)
  assert.equal(wholesaleConversion(null, 'Thùng', spec).totalPieces, null)
  assert.equal(wholesaleConversion(0, 'Thùng', spec).totalPieces, 0)
  assert.equal(wholesaleConversion(5, null, spec).totalPieces, null)
})

test('reject contradictory packaging and invalid numbers before saving', () => {
  assert.throws(() => normalizeProductSpec({
    pieceUnit: 'quyển', packUnit: 'lốc', unitsPerPack: 10,
    packsPerCarton: 10, unitsPerCarton: 96,
  }), /mâu thuẫn/)
  assert.throws(() => normalizeProductSpec({ unitsPerCarton: 50 }), /đơn vị sản phẩm lẻ/)
  assert.throws(() => normalizeProductSpec({ pieceUnit: 'quyển', unitsPerCarton: -1 }), /số nguyên dương/)
  assert.throws(() => normalizeProductSpec({ pieceUnit: 'quyển', unitsPerCarton: 1.5 }), /số nguyên dương/)
  assert.throws(() => normalizeProductSpec({ pieceUnit: 'quyển', unitsPerCarton: '0' }), /số nguyên dương/)
  assert.throws(() => validateSpecPatch({ magic: 100 }), /không được hỗ trợ/)
  assert.throws(() => normalizeProductSpec({ packUnit: 'lốc', unitsPerPack: 10 }), /ĐVT lẻ/)
})

test('catalog product accepts optional verified specs and preserves company code text', () => {
  const input = validateProductInput({
    companyCode: ' 000043 ', name: 'Tên hàng từ danh mục thực', unit: 'Thùng',
    productSpec: { pieceUnit: 'quyển', unitsPerCarton: 100 },
    expectedVersion: '0',
  })
  assert.equal(input.companyCode, '000043')
  assert.equal(input.unit, 'Thùng')
  assert.equal(input.productSpec.unitsPerCarton, 100)
  assert.equal(validateProductInput({
    companyCode: '000043', name: 'Hàng kiểm thử', expectedVersion: '0',
  }).productSpec, undefined, 'legacy updates must not erase unsubmitted specification')
})
