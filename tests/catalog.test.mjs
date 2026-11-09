import test from 'node:test'
import assert from 'node:assert/strict'
import { codeKey, parsePageLimit, toProduct } from '../server/catalog.ts'

test('mã giữ 0 đầu, không đoán mã', () => {
  assert.equal(codeKey(' 000045 '), '000045')
  assert.notEqual(codeKey('000045'), codeKey('45'))
})

test('giới hạn phân trang không cho tải vô hạn', () => {
  assert.equal(parsePageLimit(undefined), 250)
  assert.equal(parsePageLimit('500'), 500)
  assert.throws(() => parsePageLimit('501'))
  assert.throws(() => parsePageLimit('-1'))
})

test('giá/tồn null khác số 0', () => {
  const base = { company_code: '001', company_code_key: '001', sku: null, name: null, unit: null, image_url: null, inventory_updated_at: null }
  const unknown = toProduct({ ...base, quantity: null, price_map: {} })
  assert.equal(unknown.quantity, null)
  assert.deepEqual(unknown.prices, {})
  const zero = toProduct({ ...base, quantity: 0, price_map: { retail: 0, wholesale: '120000' } })
  assert.equal(zero.quantity, 0)
  assert.equal(zero.prices.retail, 0)
  assert.equal(zero.prices.wholesale, 120000)
})
