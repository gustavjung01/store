import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCode, findProducts, priceFor, stockState, formatVnd } from '../src/domain.ts'

const product = (companyCode, name = 'Mặt hàng mẫu') => ({
  companyCode, name, sku: null, unit: null, imageUrl: null,
  quantity: null, inventoryUpdatedAt: null, prices: { retail: 0, wholesale: 120000 },
})

test('mã CTY giữ số 0 đầu và loại bỏ khoảng trắng', () => {
  assert.equal(normalizeCode(' 000123 '), '000123')
  assert.notEqual(normalizeCode('000123'), normalizeCode('123'))
})

test('tìm mã CTY chính xác trước kết quả gần đúng', () => {
  const items = [product('X000123'), product('000123')]
  assert.equal(findProducts(items, '000123')[0].companyCode, '000123')
})

test('mã không trùng không tạo kết quả giả', () => {
  assert.deepEqual(findProducts([product('A001')], 'B008'), [])
})

test('tồn 0, chưa nhập và còn hàng phân biệt rõ', () => {
  assert.equal(stockState(0), 'empty')
  assert.equal(stockState(null), 'unknown')
  assert.equal(stockState(12), 'available')
  assert.equal(stockState(-1), 'unknown')
})

test('giá 0 hợp lệ, thiếu loại giá không được đoán', () => {
  const item = product('001')
  assert.equal(priceFor(item, 'retail'), 0)
  assert.equal(priceFor(item, 'missing'), null)
  assert.equal(priceFor(item, null), null)
  assert.notEqual(formatVnd(0), 'Chưa có giá')
  assert.equal(formatVnd(null), 'Chưa có giá')
})
