import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizedCode, validateImport, nonNegativeInteger, priceIdFromHeader } from '../server/importValidation.ts'
import { buildMappedImport } from '../src/excelImportMapping.ts'

function inventory(rows) {
  return validateImport({kind:'inventory',filename:'test-only.xlsx',sheet:'Test',rows,priceTypes:[],defaultPriceTypeId:null})
}
function catalog(rows, priceTypes=[{id:'gia_ban',label:'Giá bán'}]) {
  return validateImport({kind:'catalog',filename:'test-only.xlsx',sheet:'Test',rows,priceTypes,defaultPriceTypeId:'gia_ban'})
}

test('preserves zero-prefixed company codes as strings and rejects numeric cells',()=>{
  assert.equal(normalizedCode(' 0000123 '),'0000123')
  assert.notEqual(normalizedCode('0000123'),normalizedCode('123'))
  const sheet={sheet:'Test',data:[['Mã CTY','Tồn'],[123,3]]}
  const p=buildMappedImport(sheet,1,{code:0,quantity:1,name:-1,sku:-1,unit:-1,prices:[],defaultPriceColumn:-1},'inventory','test-only.xlsx')
  assert.equal(p.payload,null)
  assert.match(p.issues[0].message,/số 0 đầu/)
})

test('nonnegative valid zero, refuses negative decimal and blank',()=>{
  assert.equal(nonNegativeInteger(0,2147483647),0)
  assert.equal(nonNegativeInteger('12.345',2147483647),12345)
  assert.equal(nonNegativeInteger('12,345',2147483647),12345)
  for(const value of [-1,'-1','1.5','',null,undefined,1.2,'abc'])assert.equal(nonNegativeInteger(value,2147483647),null)
})

test('inventory duplicate normalized codes are blocking errors',()=>{
  const result=inventory([{rowNumber:2,companyCode:' 0001 ',quantity:12},{rowNumber:3,companyCode:'0001',quantity:13}])
  assert.equal(result.payload,null)
  assert.match(result.issues[0].message,/trùng/)
})

test('inventory zero is valid, missing code and empty quantity block',()=>{
  const valid=inventory([{rowNumber:2,companyCode:'0001',quantity:0}])
  assert.equal(valid.payload.rows[0].quantity,0)
  assert.equal(inventory([{rowNumber:2,companyCode:'',quantity:3}]).payload,null)
  assert.equal(inventory([{rowNumber:2,companyCode:'0001',quantity:null}]).payload,null)
})

test('catalog empty price preserves old price, zero price is not null',()=>{
  const result=catalog([{rowNumber:2,companyCode:'0001',name:'Vật tư kiểm thử',prices:{gia_ban:0}},{rowNumber:3,companyCode:'0002',prices:{}}])
  assert.equal(result.issues.length,0)
  assert.equal(result.payload.rows[0].prices.gia_ban,0)
  assert.deepEqual(result.payload.rows[1].prices,{})
})

test('catalog rejects unauthorized tier IDs and negative prices',()=>{
  const wrong=catalog([{rowNumber:2,companyCode:'0001',prices:{gia_khong_co:12}}])
  assert.equal(wrong.payload,null)
  const negative=catalog([{rowNumber:2,companyCode:'0001',prices:{gia_ban:-10}}])
  assert.equal(negative.payload,null)
})

test('two import modes are separate, no implicit missing-item zero',()=>{
  const p=inventory([{rowNumber:2,companyCode:'0001',quantity:1}])
  assert.equal(p.payload.rows.length,1)
  assert.equal(p.payload.rows[0].quantity,1)
  assert.equal('missingCodes' in p.payload,false)
})

test('price ids and duplicate mapping safely rejected',()=>{
  assert.equal(priceIdFromHeader('Giá Bán'),'gia_ban')
  const sheet={sheet:'Test',data:[['Mã CTY','Giá bán','Giá bán'],['0001',0,10]]}
  const p=buildMappedImport(sheet,1,{code:0,quantity:-1,name:-1,sku:-1,unit:-1,prices:[1,2],defaultPriceColumn:1},'catalog','test-only.xlsx')
  assert.equal(p.payload,null)
  assert.match(p.issues[0].message,/bị trùng/)
})
