import test from 'node:test'
import assert from 'node:assert/strict'
import { knownProductFactCount, productFactGroups } from '../src/productFacts.ts'

const minimal = {
  companyCode: '0115',
  name: 'F04 - 96TR 5 Ôly',
  sku: null,
  category: null,
  unit: 'Thùng',
  imageUrl: null,
  quantity: 0,
  inventoryUpdatedAt: null,
  prices: {},
}

const flatten = (groups) => groups.flatMap(group => group.facts)
const read = (groups, key) => flatten(groups).find(fact => fact.key === key)?.value

test('a product with no stored attributes exposes all labels as missing, without guessing from name', () => {
  const groups = productFactGroups(minimal)
  assert.deepEqual(groups.map(group => group.title), [
    'Thông tin bổ sung', 'Thông số sản phẩm', 'Quy cách đóng gói',
  ])
  const facts = flatten(groups)
  assert.equal(facts.length, 13)
  assert.equal(knownProductFactCount(groups), 0)
  assert.ok(facts.every(fact => fact.value === null))
  assert.equal(read(groups, 'pages'), null)
  assert.equal(read(groups, 'ruling'), null)
})

test('known catalogue fields render with labels and Vietnamese quantity formatting', () => {
  const groups = productFactGroups({
    ...minimal,
    sku: 'SKU-01',
    category: 'Vở học sinh',
    productSpec: {
      paperSize: 'A4',
      pages: 200,
      ruling: '5 ô ly',
      gsm: 70,
      coverType: 'Bìa mềm',
      pieceUnit: 'Quyển',
      packUnit: 'Lốc',
      unitsPerPack: 12,
      packsPerCarton: 8,
      unitsPerCarton: 96,
      packagingNote: 'Đã đối chiếu phiếu đóng gói',
    },
  })
  assert.equal(knownProductFactCount(groups), 13)
  assert.equal(read(groups, 'sku'), 'SKU-01')
  assert.equal(read(groups, 'category'), 'Vở học sinh')
  assert.equal(read(groups, 'pages'), '200 trang')
  assert.equal(read(groups, 'gsm'), '70 GSM')
  assert.equal(read(groups, 'unitsPerCarton'), '96')
  assert.equal(read(groups, 'packUnit'), 'Lốc')
  assert.equal(read(groups, 'packagingNote'), 'Đã đối chiếu phiếu đóng gói')
})

test('a partly completed product keeps unknown fields missing instead of hiding them', () => {
  const groups = productFactGroups({
    ...minimal, category: 'Giấy',
    productSpec: { paperSize: 'A5', pages: 100, ruling: 'Kẻ ngang' },
  })
  assert.equal(knownProductFactCount(groups), 4)
  assert.equal(read(groups, 'paperSize'), 'A5')
  assert.equal(read(groups, 'coverType'), null)
  assert.equal(read(groups, 'unitsPerCarton'), null)
})
