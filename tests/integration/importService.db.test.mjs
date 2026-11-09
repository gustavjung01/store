import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { stageImport, commitImport, rollbackImport, importHistory } from '../../server/importService.ts'
import { saveCatalogProduct, recentCatalogEdits } from '../../server/catalogService.ts'

let pool

// Intentional guard: this integration suite must NEVER connect to Neon or any external DB.
before(async () => {
  const raw = process.env.STORE_CI_DATABASE_URL
  assert.ok(raw, 'STORE_CI_DATABASE_URL is required for the isolated CI database')
  const connection = new URL(raw)
  assert.ok(['localhost', '127.0.0.1'].includes(connection.hostname), 'Refusing non-local DB')
  assert.equal(connection.pathname, '/store_ci', 'Refusing any non-CI database')
  assert.equal(connection.username, 'store_ci', 'Refusing any non-CI role')
  pool = new pg.Pool({ connectionString: raw, max: 3 })
  for (const migration of [
    'db/migrations/0001_store_catalog.sql',
    'db/migrations/0002_excel_imports.sql',
    'db/migrations/0003_catalog_edit_audit.sql',
    'db/migrations/0004_product_packaging.sql',
  ]) {
    await pool.query(await readFile(migration, 'utf8'))
  }
})

after(async () => {
  if (pool) await pool.end()
})

async function reset() {
  await pool.query(
    'TRUNCATE public.import_rows,public.inventory,public.product_prices,public.products,' +
    'public.price_settings,public.price_types,public.import_batches,public.catalog_edits,public.catalog_state ' +
    'RESTART IDENTITY CASCADE',
  )
  await pool.query('INSERT INTO public.price_settings(id) VALUES(1)')
  await pool.query('INSERT INTO public.catalog_state(id) VALUES(1)')
}

function inventory(rows) {
  return {
    kind: 'inventory', filename: 'fixture-inventory.xlsx', sheet: 'Tồn',
    defaultPriceTypeId: null, priceTypes: [], rows,
  }
}

function catalog(rows, types, defaultId) {
  return {
    kind: 'catalog', filename: 'fixture-prices.xlsx', sheet: 'Giá',
    defaultPriceTypeId: defaultId, priceTypes: types, rows,
  }
}

async function quantityFor(code) {
  const r = await pool.query(
    'SELECT i.quantity FROM public.products p LEFT JOIN public.inventory i ON i.product_id=p.id ' +
    'WHERE p.company_code_key=$1', [code],
  )
  return r.rows[0]?.quantity
}

async function version() {
  const r = await pool.query('SELECT version::text AS version FROM public.catalog_state WHERE id=1')
  return r.rows[0].version
}

test('tồn Excel: chỉ ghi mã trong file, giữ số 0 đầu, hoàn tác đầy đủ', { concurrency: false }, async () => {
  await reset()
  const first = await stageImport(pool, 'ci-admin', inventory([
    { rowNumber: 2, companyCode: 'A-GAP', quantity: 8 },
    { rowNumber: 3, companyCode: '0000123', quantity: 5 },
  ]))
  assert.equal(first.valid, true)
  assert.equal(first.summary.newCount, 2)
  assert.equal(await quantityFor('A-GAP'), undefined, 'preview must not write products')
  await commitImport(pool, 'ci-admin', first.batchId)
  assert.equal(await quantityFor('0000123'), 5)
  assert.equal(await version(), '1')

  const second = await stageImport(pool, 'ci-admin', inventory([
    { rowNumber: 2, companyCode: '0000123', quantity: 0 },
    { rowNumber: 3, companyCode: '0000999', quantity: 9 },
  ]))
  assert.equal(second.valid, true)
  assert.equal(second.summary.absentCodesUnaffected, 1)
  assert.equal(await quantityFor('0000123'), 5, 'preview must not update inventory')
  await commitImport(pool, 'ci-admin', second.batchId)
  assert.equal(await quantityFor('0000123'), 0)
  assert.equal(await quantityFor('0000999'), 9)
  assert.equal(await quantityFor('A-GAP'), 8, 'code missing in Excel must be unchanged')
  assert.equal(await version(), '2')

  const undone = await rollbackImport(pool, 'ci-admin', second.batchId)
  assert.equal(undone.revertedRows, 2)
  assert.equal(await quantityFor('0000123'), 5)
  assert.equal(await quantityFor('0000999'), undefined)
  assert.equal(await quantityFor('A-GAP'), 8)
  assert.equal(await version(), '3')
  const history = await importHistory(pool)
  assert.equal(history.batches.find(b => b.id === second.batchId).status, 'rolled_back')
  const audit = await pool.query('SELECT count(*)::int AS n FROM public.import_rows WHERE batch_id=$1', [second.batchId])
  assert.equal(audit.rows[0].n, 2, 'rollback must retain audit trail')
})

test('catalog: giá 0 hợp lệ, bỏ trống giữ giá cũ, rollback khôi phục giá và mặc định', { concurrency: false }, async () => {
  await reset()
  const seed = await stageImport(pool, 'ci-admin', inventory([
    { rowNumber: 2, companyCode: '0000100', quantity: 7 },
  ]))
  await commitImport(pool, 'ci-admin', seed.batchId)

  const tiers = [{ id: 'retail', label: 'Bán lẻ' }, { id: 'wholesale', label: 'Bán sỉ' }]
  const first = await stageImport(pool, 'ci-admin', catalog([
    { rowNumber: 2, companyCode: '0000100', name: 'Mặt hàng kiểm thử', prices: { retail: 1000, wholesale: 0 } },
    { rowNumber: 3, companyCode: '0000101', name: 'Mặt hàng kiểm thử khác', prices: { retail: 500 } },
  ], tiers, 'retail'))
  assert.equal(first.valid, true)
  await commitImport(pool, 'ci-admin', first.batchId)
  const price = async (type) => {
    const r = await pool.query(
      'SELECT pp.amount::text AS amount FROM public.product_prices pp ' +
      'JOIN public.products p ON p.id=pp.product_id ' +
      'WHERE p.company_code_key=$1 AND pp.price_type_id=$2',
      ['0000100', type],
    )
    return r.rows[0]?.amount
  }
  assert.equal(await price('retail'), '1000')
  assert.equal(await price('wholesale'), '0')
  assert.equal(await quantityFor('0000100'), 7)

  const change = await stageImport(pool, 'ci-admin', catalog([
    { rowNumber: 2, companyCode: '0000100', prices: { retail: 1100 } },
  ], [{ id: 'retail', label: 'Bán lẻ' }], null))
  assert.equal(change.valid, true)
  await commitImport(pool, 'ci-admin', change.batchId)
  assert.equal(await price('retail'), '1100')
  assert.equal(await price('wholesale'), '0', 'omitted tier must remain untouched')
  await rollbackImport(pool, 'ci-admin', change.batchId)
  assert.equal(await price('retail'), '1000')
  await rollbackImport(pool, 'ci-admin', first.batchId)
  assert.equal(await price('retail'), undefined)
  assert.equal(await price('wholesale'), undefined)
  assert.equal(await quantityFor('0000100'), 7)
  assert.equal(await quantityFor('0000101'), undefined)
  const defaults = await pool.query('SELECT default_price_type_id FROM public.price_settings WHERE id=1')
  assert.equal(defaults.rows[0].default_price_type_id, null)
  const typeCount = await pool.query('SELECT count(*)::int AS n FROM public.price_types')
  assert.equal(typeCount.rows[0].n, 0)
})

test('version lock rejects stale preview and protects the last committed snapshot', { concurrency: false }, async () => {
  await reset()
  const older = await stageImport(pool, 'ci-admin', inventory([
    { rowNumber: 2, companyCode: '00001', quantity: 1 },
  ]))
  const newest = await stageImport(pool, 'ci-admin', inventory([
    { rowNumber: 2, companyCode: '00001', quantity: 2 },
  ]))
  await commitImport(pool, 'ci-admin', newest.batchId)
  await assert.rejects(
    () => commitImport(pool, 'ci-admin', older.batchId),
    (e) => e.status === 409 && /xem trước lại/.test(e.message),
  )
  assert.equal(await quantityFor('00001'), 2)
  assert.equal(await version(), '1')
})

test('mid-import SQL error rolls back all new stock, product and audit rows', { concurrency: false }, async () => {
  await reset()
  await pool.query(
    'CREATE FUNCTION public.store_ci_reject_17() RETURNS trigger LANGUAGE plpgsql AS $$ ' +
    'BEGIN IF NEW.quantity = 17 THEN RAISE EXCEPTION \'CI rejected quantity\'; END IF; RETURN NEW; END $$',
  )
  await pool.query(
    'CREATE TRIGGER store_ci_reject_17 BEFORE INSERT OR UPDATE ON public.inventory ' +
    'FOR EACH ROW EXECUTE FUNCTION public.store_ci_reject_17()',
  )
  try {
    const preview = await stageImport(pool, 'ci-admin', inventory([
      { rowNumber: 2, companyCode: '0001', quantity: 5 },
      { rowNumber: 3, companyCode: '0002', quantity: 17 },
    ]))
    assert.equal(preview.valid, true)
    await assert.rejects(() => commitImport(pool, 'ci-admin', preview.batchId), (e) => e.status === 503)
    const r = await pool.query(
      'SELECT (SELECT count(*)::int FROM public.products) AS products,' +
      '(SELECT count(*)::int FROM public.inventory) AS inventory,' +
      '(SELECT count(*)::int FROM public.import_rows) AS audit',
    )
    assert.deepEqual(r.rows[0], { products: 0, inventory: 0, audit: 0 })
    assert.equal(await version(), '0')
    const batch = await pool.query('SELECT status FROM public.import_batches WHERE id=$1', [preview.batchId])
    assert.equal(batch.rows[0].status, 'pending')
  } finally {
    await pool.query('DROP TRIGGER IF EXISTS store_ci_reject_17 ON public.inventory')
    await pool.query('DROP FUNCTION IF EXISTS public.store_ci_reject_17()')
  }
})

test('danh mục thủ công: mã CTY và tên bắt buộc, lưu nhật ký, giá/tồn vẫn nguyên', { concurrency: false }, async () => {
  await reset()
  const input = { companyCode: '000054', name: 'Hàng kiểm thử A', sku: 'T-SKU-1', unit: 'cái', category: 'Nhóm kiểm thử', expectedVersion: '0' }
  const created = await saveCatalogProduct(pool, 'ci-admin', input, 'create')
  assert.equal(created.version, '1')
  const product = await pool.query(
    'SELECT company_code,name,sku,unit,category FROM public.products WHERE company_code_key=$1', ['000054'],
  )
  assert.deepEqual(product.rows[0], {
    company_code: '000054', name: 'Hàng kiểm thử A', sku: 'T-SKU-1',
    unit: 'cái', category: 'Nhóm kiểm thử',
  })
  assert.equal(await quantityFor('000054'), null)
  const count = await pool.query('SELECT count(*)::int AS n FROM public.inventory')
  assert.equal(count.rows[0].n, 0, 'manual catalog create must never invent stock')

  await assert.rejects(() => saveCatalogProduct(pool, 'ci-admin', input, 'create'), (err) => err.status === 409)
  await assert.rejects(() => saveCatalogProduct(pool, 'ci-admin', {
    ...input, companyCode: '000055', name: '  ', expectedVersion: '1',
  }, 'create'), (err) => err.status === 400)
  const edited = await saveCatalogProduct(pool, 'ci-admin', {
    ...input, name: 'Hàng kiểm thử B', sku: null, expectedVersion: '1',
  }, 'update', '000054')
  assert.equal(edited.version, '2')
  const result = await pool.query('SELECT name,sku FROM public.products WHERE company_code_key=$1', ['000054'])
  assert.deepEqual(result.rows[0], { name: 'Hàng kiểm thử B', sku: null })
  const audit = await recentCatalogEdits(pool)
  assert.equal(audit.edits.length, 2)
  assert.equal(audit.edits[0].action, 'update')
  assert.equal(audit.edits[0].before_data.name, 'Hàng kiểm thử A')
  assert.equal(audit.edits[0].after_data.name, 'Hàng kiểm thử B')
  assert.equal(audit.edits[1].action, 'create')
  await assert.rejects(() => saveCatalogProduct(pool, 'ci-admin', {
    ...input, name: 'Ghi đè sai version', expectedVersion: '1',
  }, 'update', '000054'), (err) => err.status === 409)
  assert.equal(await version(), '2')
})

test('nhập tồn tạo mã tạm; catalog thiếu tên không được tạo; admin hoàn thiện mà không mất tồn', { concurrency: false }, async () => {
  await reset()
  const inventoryPreview = await stageImport(pool, 'ci-admin', inventory([
    { rowNumber: 2, companyCode: '000078', quantity: 15 },
  ]))
  await commitImport(pool, 'ci-admin', inventoryPreview.batchId)
  assert.equal(await quantityFor('000078'), 15)

  const catalogMissing = await stageImport(pool, 'ci-admin', catalog([
    { rowNumber: 2, companyCode: '000078', prices: { retail: 55 } },
    { rowNumber: 3, companyCode: '000079', name: 'Tên thực của mã mới', prices: { retail: 60 } },
  ], [{ id: 'retail', label: 'Bán lẻ' }], 'retail'))
  assert.equal(catalogMissing.valid, false, 'un-named inventory-only code must not be silently added to catalog')
  assert.match(catalogMissing.errors[0].message, /tên hàng/)
  const count = await pool.query('SELECT count(*)::int AS n FROM public.products')
  assert.equal(count.rows[0].n, 1, 'failed preview must not create code 000079')

  const completed = await saveCatalogProduct(pool, 'ci-admin', {
    companyCode: '000078', name: 'Tên được nhập sau', sku: null, unit: 'hộp', category: null,
    expectedVersion: '1',
  }, 'update', '000078')
  assert.equal(completed.version, '2')
  assert.equal(await quantityFor('000078'), 15, 'catalog change does not affect inventory')

  const priceOnly = await stageImport(pool, 'ci-admin', catalog([
    { rowNumber: 2, companyCode: '000078', prices: { retail: 0 } },
  ], [{ id: 'retail', label: 'Bán lẻ' }], 'retail'))
  assert.equal(priceOnly.valid, true, 'existing named product can import prices without changing name')
  await commitImport(pool, 'ci-admin', priceOnly.batchId)
  const record = await pool.query(
    'SELECT p.name,pp.amount::text AS price FROM public.products p ' +
    'JOIN public.product_prices pp ON pp.product_id=p.id WHERE p.company_code_key=$1',
    ['000078'],
  )
  assert.deepEqual(record.rows[0], { name: 'Tên được nhập sau', price: '0' })
})

test('không cho rollback Excel làm mất tên/sửa tay đã thực hiện sau lần nhập', { concurrency: false }, async () => {
  await reset()
  const preview = await stageImport(pool, 'ci-admin', inventory([
    { rowNumber: 2, companyCode: '000099', quantity: 12 },
  ]))
  await commitImport(pool, 'ci-admin', preview.batchId)
  await saveCatalogProduct(pool, 'ci-admin', {
    companyCode: '000099', name: 'Tên hoàn thiện', sku: null, unit: null, category: null,
    expectedVersion: '1',
  }, 'update', '000099')
  await assert.rejects(
    () => rollbackImport(pool, 'ci-admin', preview.batchId),
    (err) => err.status === 409 && /sửa thủ công/.test(err.message),
  )
  const found = await pool.query('SELECT name FROM public.products WHERE company_code_key=$1', ['000099'])
  assert.equal(found.rows[0].name, 'Tên hoàn thiện')
  assert.equal(await quantityFor('000099'), 12)
  assert.equal(await version(), '2')
})

test('manual catalogue stores verified carton specs and preserves them on legacy update', { concurrency: false }, async () => {
  await reset()
  const input = {
    companyCode: '000070', name: 'Hàng kiểm thử quy cách',
    sku: null, unit: 'Thùng', category: null, expectedVersion: '0',
    productSpec: { pieceUnit: 'quyển', unitsPerCarton: 100, paperSize: 'A4', pages: 96 },
  }
  await saveCatalogProduct(pool, 'ci-admin', input, 'create')
  let found = await pool.query(
    'SELECT unit,product_spec FROM public.products WHERE company_code_key=$1', ['000070'],
  )
  assert.equal(found.rows[0].unit, 'Thùng')
  assert.equal(found.rows[0].product_spec.unitsPerCarton, 100)
  assert.equal(found.rows[0].product_spec.pieceUnit, 'quyển')
  assert.equal(await quantityFor('000070'), null, 'product specification must not create inventory')

  await saveCatalogProduct(pool, 'ci-admin', {
    companyCode: '000070', name: 'Tên được sửa sau', sku: null,
    unit: 'Thùng', category: null, expectedVersion: '1',
  }, 'update', '000070')
  found = await pool.query(
    'SELECT name,unit,product_spec FROM public.products WHERE company_code_key=$1', ['000070'],
  )
  assert.equal(found.rows[0].product_spec.unitsPerCarton, 100, 'omitted spec preserves previous facts')
  assert.equal(found.rows[0].name, 'Tên được sửa sau')
  const audit = await recentCatalogEdits(pool)
  assert.equal(audit.edits[0].before_data.productSpec.unitsPerCarton, 100)
  assert.equal(audit.edits[0].after_data.productSpec.unitsPerCarton, 100)
})

test('catalogue Excel maps carton specs, defaults new unit to Thùng and restores specs on rollback', { concurrency: false }, async () => {
  await reset()
  const firstPayload = catalog([
    { rowNumber: 2, companyCode: '000071', name: 'Hàng kiểm thử A',
      productSpec: { pieceUnit: 'quyển', unitsPerCarton: 100, paperSize: 'A4' } },
    { rowNumber: 3, companyCode: '000072', name: 'Hàng kiểm thử B', unit: 'Hộp',
      productSpec: { pieceUnit: 'cái', unitsPerCarton: 12 } },
  ], [], null)
  firstPayload.defaultUnitForNew = 'Thùng'
  const first = await stageImport(pool, 'ci-admin', firstPayload)
  assert.equal(first.valid, true)
  assert.equal(first.summary.sample[0].nextUnit, 'Thùng')
  assert.equal(first.summary.sample[1].nextUnit, 'Hộp')
  assert.equal(first.summary.sample[0].nextCarton, 100)
  await commitImport(pool, 'ci-admin', first.batchId)
  const before = await pool.query(
    'SELECT company_code,unit,product_spec FROM public.products ORDER BY company_code',
  )
  assert.deepEqual(before.rows.map(x => [x.company_code,x.unit,x.product_spec.unitsPerCarton]), [
    ['000071','Thùng',100],['000072','Hộp',12],
  ])

  const patch = catalog([
    { rowNumber: 2, companyCode: '000071', productSpec: { pages: 120 } },
  ], [], null)
  patch.defaultUnitForNew = 'Thùng'
  const change = await stageImport(pool, 'ci-admin', patch)
  assert.equal(change.valid, true)
  assert.equal(change.summary.sample[0].nextUnit, 'Thùng')
  assert.equal(change.summary.sample[0].nextCarton, 100)
  await commitImport(pool, 'ci-admin', change.batchId)
  let row = await pool.query('SELECT product_spec FROM public.products WHERE company_code_key=$1', ['000071'])
  assert.equal(row.rows[0].product_spec.pages, 120)
  assert.equal(row.rows[0].product_spec.unitsPerCarton, 100, 'unmapped carton conversion is preserved')
  await rollbackImport(pool, 'ci-admin', change.batchId)
  row = await pool.query('SELECT product_spec FROM public.products WHERE company_code_key=$1', ['000071'])
  assert.equal(row.rows[0].product_spec.pages, null)
  assert.equal(row.rows[0].product_spec.unitsPerCarton, 100)
  await rollbackImport(pool, 'ci-admin', first.batchId)
  const count = await pool.query('SELECT count(*)::int AS count FROM public.products')
  assert.equal(count.rows[0].count, 0)
})

test('stock-only Excel creates unknown-unit code; rejects contradictory carton specs at preview', { concurrency: false }, async () => {
  await reset()
  const inventoryPreview = await stageImport(pool, 'ci-admin', inventory([
    { rowNumber: 2, companyCode: '000075', quantity: 7 },
  ]))
  assert.equal(inventoryPreview.valid, true)
  assert.equal(inventoryPreview.summary.sample[0].nextUnit, null)
  assert.equal(inventoryPreview.summary.missingUnitCount, 1)
  await commitImport(pool, 'ci-admin', inventoryPreview.batchId)
  const initial = await pool.query('SELECT unit FROM public.products WHERE company_code_key=$1', ['000075'])
  assert.equal(initial.rows[0].unit, null, 'inventory import must not guess a carton unit')

  const bad = await stageImport(pool, 'ci-admin', catalog([
    { rowNumber: 2, companyCode: '000075', name: 'Hàng thử nghiệm',
      productSpec: { pieceUnit:'quyển', packUnit:'lốc', unitsPerPack:10, packsPerCarton:12, unitsPerCarton:96 } },
  ], [], null))
  assert.equal(bad.valid, false)
  assert.match(bad.errors[0].message, /mâu thuẫn/)
  const check = await pool.query('SELECT product_spec FROM public.products WHERE company_code_key=$1', ['000075'])
  assert.deepEqual(check.rows[0].product_spec, {})
  assert.equal(await quantityFor('000075'), 7)

  const good = await stageImport(pool, 'ci-admin', catalog([
    { rowNumber: 2, companyCode: '000075', name: 'Hàng thử nghiệm', unit: 'Thùng',
      productSpec: { pieceUnit:'quyển', unitsPerCarton:100 } },
  ], [], null))
  assert.equal(good.valid, true)
  await commitImport(pool, 'ci-admin', good.batchId)
  assert.equal(await quantityFor('000075'), 7)
  const actual = await pool.query('SELECT unit,product_spec FROM public.products WHERE company_code_key=$1', ['000075'])
  assert.equal(actual.rows[0].unit, 'Thùng')
  assert.equal(actual.rows[0].product_spec.unitsPerCarton, 100)
  await rollbackImport(pool, 'ci-admin', good.batchId)
  const undone = await pool.query('SELECT unit,product_spec FROM public.products WHERE company_code_key=$1', ['000075'])
  assert.equal(undone.rows[0].unit, null)
  assert.deepEqual(undone.rows[0].product_spec, {})
  assert.equal(await quantityFor('000075'), 7)
})
