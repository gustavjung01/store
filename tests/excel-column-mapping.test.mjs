import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyMapping, mapColumn, suggestMapping, targetForColumn } from '../src/excelColumnMapping.ts'

test('single-sheet STORE catalogue suggests exact columns, never selects prices', () => {
  const sheet = { sheet: 'DANH_MUC', data: [
    ['Mã CTY', 'Tên hàng', 'Đơn vị tính', 'Khổ giấy', 'Số trang', 'Dòng kẻ', 'Giá NET'],
    ['0124', 'Tên từ Excel', 'Thùng', 'A5', 200, '4 ô ly', 15000],
  ] }
  const map = suggestMapping(sheet, 1, 'catalog')
  assert.equal(map.code, 0)
  assert.equal(map.name, 1)
  assert.equal(map.unit, 2)
  assert.equal(map.specColumns.paperSize, 3)
  assert.equal(map.specColumns.pages, 4)
  assert.equal(map.specColumns.ruling, 5)
  assert.deepEqual(map.prices, [])
  assert.equal(targetForColumn(map, 6, 'catalog'), 'skip')
})

test('inventory gets safe column matching, preserves leading zero codes', () => {
  const sheet = { sheet: 'TON_KHO', data: [['Mã CTY', 'Số tồn'], ['000124', 0]] }
  const map = suggestMapping(sheet, 1, 'inventory')
  assert.equal(map.code, 0)
  assert.equal(map.quantity, 1)
  assert.equal(sheet.data[1][0], '000124')
})

test('assigning a new field removes previous mapping and avoids duplicate columns', () => {
  const sheet = { sheet: 'DANH_MUC', data: [
    ['Mã CTY', 'Tên hàng', 'Đơn vị tính', 'Khổ giấy', 'Số trang', 'Dòng kẻ', 'Giá duyệt'],
    ['0124', 'Tên', 'Thùng', 'A5', 200, '4 ô ly', 1000],
  ] }
  let map = suggestMapping(sheet, 1, 'catalog')
  map = mapColumn(map, 6, 'price', 'catalog')
  assert.deepEqual(map.prices, [6])
  map = { ...map, defaultPriceColumn: 6 }
  map = mapColumn(map, 6, 'name', 'catalog')
  assert.equal(map.name, 6)
  assert.equal(targetForColumn(map, 1, 'catalog'), 'skip')
  assert.deepEqual(map.prices, [])
  assert.equal(map.defaultPriceColumn, -1)
  assert.equal(targetForColumn(map, 6, 'catalog'), 'name')
  map = mapColumn(map, 3, 'skip', 'catalog')
  assert.equal(map.specColumns.paperSize, -1)
})

test('unknown headers remain skipped and duplicates never silently replace a mapped code', () => {
  const sheet = { sheet: 'DANH_MUC', data: [
    ['Mã CTY', 'Mã CTY', 'Danh mục cha', 'Giá PDF 8%', 'Thông tin nội bộ'],
    ['00001', '00001', 'Nhóm giấy', 9000, 'Ghi chú'],
  ] }
  const map = suggestMapping(sheet, 1, 'catalog')
  assert.equal(map.code, 0)
  assert.equal(targetForColumn(map, 1, 'catalog'), 'skip')
  assert.equal(targetForColumn(map, 2, 'catalog'), 'skip')
  assert.equal(targetForColumn(map, 3, 'catalog'), 'skip')
  assert.equal(targetForColumn(map, 4, 'catalog'), 'skip')
})

test('mapping defaults protect old stock and never invent a price type', () => {
  const map = emptyMapping()
  assert.equal(map.code, -1)
  assert.deepEqual(map.prices, [])
  assert.equal(map.defaultPriceColumn, -1)
})
