import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import { stageImport, commitImport, rollbackImport, importHistory } from '../server/importService.ts'

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
    'public.price_settings,public.price_types,public.import_batches,public.catalog_state ' +
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
