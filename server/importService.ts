import type { Pool, PoolClient } from 'pg'
import { ImportFailure, validateImport } from './importValidation.ts'
import type { ImportPayload, ImportRow } from './importValidation'

interface ExistingProduct {
  id: string
  company_code: string
  company_code_key: string
  sku: string | null
  name: string | null
  unit: string | null
  category: string | null
  image_url: string | null
  created_at: Date
  updated_at: Date
  quantity: number | null
  stock_updated_at: Date | null
  last_import_batch_id: string | null
  price_map: Record<string, string>
  inventory_exists: boolean
}

interface StagedBatch {
  id: string
  kind: 'inventory' | 'catalog'
  status: string
  imported_by: string
  base_version: string
  staged_payload: ImportPayload
  expires_at: Date
  applied_at: Date | null
  undo_metadata: { previousDefault: string | null; newTypes: string[] } | null
}

function apiError(error: unknown): never {
  if (error instanceof ImportFailure) throw error
  throw new ImportFailure('Không thể xử lý lượt nhập Excel; dữ liệu chưa được cập nhật', 503)
}

async function transaction<T>(pool: Pool, callback: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect()
  try {
    await db.query('BEGIN')
    const result = await callback(db)
    await db.query('COMMIT')
    return result
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    db.release()
  }
}

async function currentVersion(db: PoolClient): Promise<string> {
  const result = await db.query<{ version: string }>(
    'SELECT version FROM public.catalog_state WHERE id = 1 FOR UPDATE',
  )
  if (!result.rows[0]) throw new ImportFailure('Chưa khởi tạo catalog_state', 503)
  return result.rows[0].version
}

async function lookupAll(db: PoolClient, codes: string[]): Promise<Map<string, ExistingProduct>> {
  const result = await db.query<ExistingProduct>(
    `SELECT p.id,p.company_code,p.company_code_key,p.sku,p.name,p.unit,p.category,
       p.image_url,p.created_at,p.updated_at,
       i.quantity,i.updated_at AS stock_updated_at,i.last_import_batch_id,
       (i.product_id IS NOT NULL) AS inventory_exists,
       COALESCE((SELECT jsonb_object_agg(pp.price_type_id,pp.amount::text)
         FROM public.product_prices pp WHERE pp.product_id=p.id), '{}'::jsonb) AS price_map
       FROM public.products p LEFT JOIN public.inventory i ON i.product_id=p.id
       WHERE p.company_code_key = ANY($1::text[])`, [codes],
  )
  return new Map(result.rows.map((p) => [p.company_code_key, p]))
}

function rowChanges(row: ImportRow, old: ExistingProduct | undefined, kind: 'inventory' | 'catalog'): boolean {
  if (!old) return true
  if (kind === 'inventory') return old.quantity !== row.quantity
  if (row.name !== null && row.name !== undefined && row.name !== old.name) return true
  if (row.sku !== null && row.sku !== undefined && row.sku !== old.sku) return true
  if (row.unit !== null && row.unit !== undefined && row.unit !== old.unit) return true
  return Object.entries(row.prices ?? {}).some(([type, value]) => {
    return old.price_map[type] === undefined || Number(old.price_map[type]) !== value
  })
}

export async function stageImport(pool: Pool, actor: string, raw: unknown) {
  const validated = validateImport(raw)
  if (!validated.payload) {
    return { valid: false, errors: validated.issues, batchId: null }
  }
  const payload = validated.payload
  try {
    return await transaction(pool, async (db) => {
      const version = await currentVersion(db)
      const old = await lookupAll(db, payload.rows.map((r) => r.companyCode))
      if (payload.kind === 'catalog') {
        const existingTypes = await db.query<{ id: string; label: string }>(
          'SELECT id,label FROM public.price_types WHERE id = ANY($1::text[])',
          [payload.priceTypes.map((t) => t.id)],
        )
        for (const t of existingTypes.rows) {
          const candidate = payload.priceTypes.find((x) => x.id === t.id)
          if (candidate && candidate.label !== t.label) {
            return {
              valid: false,
              errors: [{ rowNumber: 0, message: 'Loại giá ' + t.id + ' đã tồn tại với tên khác' }],
              batchId: null,
            }
          }
        }
      }
      const samples: Array<Record<string, unknown>> = []
      let newCount = 0, changedCount = 0, unchangedCount = 0
      for (const row of payload.rows) {
        const before = old.get(row.companyCode)
        const action = !before ? 'new' : rowChanges(row, before, payload.kind) ? 'changed' : 'unchanged'
        if (action === 'new') newCount++
        else if (action === 'changed') changedCount++
        else unchangedCount++
        if (samples.length < 80) samples.push({
          rowNumber: row.rowNumber,
          companyCode: row.companyCode,
          action,
          previousQuantity: before?.quantity ?? null,
          nextQuantity: payload.kind === 'inventory' ? row.quantity : before?.quantity ?? null,
          previousPrices: payload.kind === 'catalog' ? before?.price_map ?? {} : {},
          nextPrices: payload.kind === 'catalog' ? row.prices ?? {} : {},
        })
      }
      const missing = await db.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM public.products WHERE NOT(company_code_key = ANY($1::text[]))',
        [payload.rows.map((r) => r.companyCode)],
      )
      const summary = {
        total: payload.rows.length,
        newCount,
        changedCount,
        unchangedCount,
        absentCodesUnaffected: Number(missing.rows[0]?.count ?? 0),
        sample: samples,
      }
      const batch = await db.query<{ id: string }>(
        `INSERT INTO public.import_batches
           (kind,status,filename,imported_by,row_count,base_version,staged_payload,expires_at,summary)
         VALUES ($1,'pending',$2,$3,$4,$5,$6::jsonb,now() + interval '20 minutes',$7::jsonb)
         RETURNING id`,
        [payload.kind,payload.filename,actor,payload.rows.length,version,JSON.stringify(payload),JSON.stringify(summary)],
      )
      return { valid: true, batchId: batch.rows[0].id, summary, errors: [] }
    })
  } catch (error) { return apiError(error) }
}

async function readBatch(db: PoolClient, id: string): Promise<StagedBatch> {
  const result = await db.query<StagedBatch>(
    'SELECT id,kind,status,imported_by,base_version,staged_payload,expires_at,applied_at,undo_metadata FROM public.import_batches WHERE id=$1 FOR UPDATE',
    [id],
  )
  if (!result.rows[0]) throw new ImportFailure('Không tìm thấy lượt nhập', 404)
  return result.rows[0]
}

export async function commitImport(pool: Pool, actor: string, id: string) {
  try {
    return await transaction(pool, async (db) => {
      const version = await currentVersion(db)
      const batch = await readBatch(db, id)
      if (batch.imported_by !== actor) throw new ImportFailure('Chỉ người đã xem trước được xác nhận lượt nhập', 403)
      if (batch.status !== 'pending') throw new ImportFailure('Lượt nhập đã được xử lý', 409)
      if (new Date(batch.expires_at).getTime() <= Date.now()) throw new ImportFailure('Bản xem trước hết hạn, vui lòng tạo lại', 409)
      if (version !== batch.base_version) throw new ImportFailure('Danh mục đã thay đổi, cần xem trước lại', 409)
      const { payload, issues } = validateImport(batch.staged_payload)
      if (!payload || issues.length) throw new ImportFailure('Dữ liệu chờ nhập không hợp lệ', 422)
      const previous = await lookupAll(db, payload.rows.map(r => r.companyCode))
      const previousDefaultResult = await db.query<{ default_price_type_id: string | null }>(
        'SELECT default_price_type_id FROM public.price_settings WHERE id=1 FOR UPDATE',
      )
      const previousDefault = previousDefaultResult.rows[0]?.default_price_type_id ?? null
      const newTypes: string[] = []
      if (payload.kind === 'catalog') {
        for (const type of payload.priceTypes) {
          const existing = await db.query<{ label: string }>(
            'SELECT label FROM public.price_types WHERE id=$1', [type.id],
          )
          if (existing.rows[0] && existing.rows[0].label !== type.label) throw new ImportFailure('Loại giá đã đổi tên, xem trước lại',409)
          if (!existing.rows[0]) {
            await db.query('INSERT INTO public.price_types(id,label,sort_order) VALUES ($1,$2,$3)',[type.id,type.label,payload.priceTypes.indexOf(type)])
            newTypes.push(type.id)
          }
        }
      }
      for (const row of payload.rows) {
        const old = previous.get(row.companyCode)
        let productId = old?.id
        if (!productId) {
          const created = await db.query<{ id: string }>(
            'INSERT INTO public.products(company_code) VALUES($1) RETURNING id', [row.companyCode],
          )
          productId = created.rows[0].id
        }
        const priorProduct = old ? {
          sku:old.sku,name:old.name,unit:old.unit,updated_at:old.updated_at,
        } : null
        const previousPrices: Record<string, number | null> = {}
        const nextPrices: Record<string, number> = {}
        if (payload.kind === 'inventory') {
          await db.query(
            `INSERT INTO public.inventory(product_id,quantity,last_import_batch_id,updated_at)
              VALUES ($1,$2,$3,now())
              ON CONFLICT(product_id) DO UPDATE SET quantity=excluded.quantity,
                last_import_batch_id=excluded.last_import_batch_id,updated_at=now()`,
            [productId,row.quantity,id],
          )
        } else {
          if (old) await db.query(
            'UPDATE public.products SET sku=COALESCE($2,sku), name=COALESCE($3,name), unit=COALESCE($4,unit), updated_at=now() WHERE id=$1',
            [productId,row.sku,row.name,row.unit],
          )
          else await db.query(
            'UPDATE public.products SET sku=$2,name=$3,unit=$4,updated_at=now() WHERE id=$1',
            [productId,row.sku,row.name,row.unit],
          )
          for (const [type, amount] of Object.entries(row.prices ?? {})) {
            previousPrices[type] = old?.price_map[type] === undefined ? null : Number(old.price_map[type])
            nextPrices[type] = amount
            await db.query(
              `INSERT INTO public.product_prices(product_id,price_type_id,amount)
                VALUES($1,$2,$3)
                ON CONFLICT(product_id,price_type_id)
                DO UPDATE SET amount=excluded.amount,updated_at=now()`,
              [productId,type,amount],
            )
          }
        }
        await db.query(
          `INSERT INTO public.import_rows
           (batch_id,row_number,company_code,previous_quantity,next_quantity,
            previous_prices,next_prices,previous_product,previous_inventory_exists,
            previous_inventory_updated_at,previous_inventory_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,$11)`,
          [
            id,row.rowNumber,row.companyCode,old?.quantity ?? null,
            payload.kind === 'inventory' ? row.quantity : null,
            JSON.stringify(previousPrices),JSON.stringify(nextPrices),JSON.stringify(priorProduct),
            old?.inventory_exists ?? false,old?.stock_updated_at ?? null,old?.last_import_batch_id ?? null,
          ],
        )
      }
      if (payload.kind === 'catalog' && payload.defaultPriceTypeId) {
        await db.query(
          'UPDATE public.price_settings SET default_price_type_id=$1,updated_at=now() WHERE id=1',
          [payload.defaultPriceTypeId],
        )
      }
      await db.query(
        `UPDATE public.import_batches SET status='applied',applied_at=now(),
         staged_payload=NULL,undo_metadata=$2::jsonb WHERE id=$1`,
        [id,JSON.stringify({ previousDefault, newTypes })],
      )
      await db.query('UPDATE public.catalog_state SET version=version+1,updated_at=now() WHERE id=1')
      return { success: true, batchId: id, count: payload.rows.length }
    })
  } catch (error) { return apiError(error) }
}

interface AuditRow {
  company_code: string
  previous_product: { sku:string|null;name:string|null;unit:string|null;updated_at:string } | null
  previous_quantity: number | null
  previous_prices: Record<string,number|null>
  next_prices: Record<string,number>
  previous_inventory_exists: boolean
  previous_inventory_updated_at: Date | null
  previous_inventory_batch_id: string | null
}

export async function rollbackImport(pool: Pool, actor: string, id: string) {
  try {
    return await transaction(pool, async (db) => {
      await currentVersion(db)
      const latest = await db.query<{ id: string }>(
        `SELECT id FROM public.import_batches WHERE status='applied'
         ORDER BY applied_at DESC,id DESC LIMIT 1`,
      )
      if (latest.rows[0]?.id !== id) throw new ImportFailure('Chỉ hoàn tác được lượt nhập gần nhất chưa bị thay thế', 409)
      const batch = await readBatch(db,id)
      if (batch.status !== 'applied') throw new ImportFailure('Lượt nhập không còn ở trạng thái đã áp dụng',409)
      const audit = await db.query<AuditRow>(
        'SELECT company_code,previous_product,previous_quantity,previous_prices,next_prices,previous_inventory_exists,previous_inventory_updated_at,previous_inventory_batch_id FROM public.import_rows WHERE batch_id=$1 ORDER BY id DESC',
        [id],
      )
      for (const entry of audit.rows) {
        const found = await db.query<{ id: string }>(
          'SELECT id FROM public.products WHERE company_code_key=$1',
          [entry.company_code],
        )
        const productId = found.rows[0]?.id
        if (!productId) throw new ImportFailure('Không thể hoàn tác vì sản phẩm đã bị xóa',409)
        if (entry.previous_product === null) {
          // This code only existed because of this batch; no later imports allowed.
          await db.query('DELETE FROM public.products WHERE id=$1',[productId])
          continue
        }
        if (batch.kind === 'inventory') {
          if (entry.previous_inventory_exists) await db.query(
            `UPDATE public.inventory SET quantity=$2,updated_at=$3,last_import_batch_id=$4
             WHERE product_id=$1`,
            [productId,entry.previous_quantity,entry.previous_inventory_updated_at,entry.previous_inventory_batch_id],
          )
          else await db.query('DELETE FROM public.inventory WHERE product_id=$1',[productId])
        } else {
          const p = entry.previous_product
          await db.query(
            'UPDATE public.products SET sku=$2,name=$3,unit=$4,updated_at=$5 WHERE id=$1',
            [productId,p.sku,p.name,p.unit,p.updated_at],
          )
          for (const type of Object.keys(entry.next_prices ?? {})) {
            const amount = entry.previous_prices?.[type]
            if (amount === null || amount === undefined) await db.query(
              'DELETE FROM public.product_prices WHERE product_id=$1 AND price_type_id=$2',
              [productId,type],
            )
            else await db.query(
              `INSERT INTO public.product_prices(product_id,price_type_id,amount)
               VALUES($1,$2,$3) ON CONFLICT(product_id,price_type_id)
               DO UPDATE SET amount=excluded.amount,updated_at=now()`,[productId,type,amount],
            )
          }
        }
      }
      if (batch.kind === 'catalog') {
        await db.query(
          'UPDATE public.price_settings SET default_price_type_id=$1,updated_at=now() WHERE id=1',
          [batch.undo_metadata?.previousDefault ?? null],
        )
        for (const type of batch.undo_metadata?.newTypes ?? []) {
          await db.query('DELETE FROM public.price_types WHERE id=$1',[type])
        }
      }
      await db.query(
        `UPDATE public.import_batches SET status='rolled_back',undone_by=$2,undone_at=now()
         WHERE id=$1`,[id,actor],
      )
      await db.query('UPDATE public.catalog_state SET version=version+1,updated_at=now() WHERE id=1')
      return { success:true, batchId:id, revertedRows:audit.rows.length }
    })
  } catch (error) { return apiError(error) }
}

export async function importHistory(pool: Pool) {
  const result = await pool.query(
    `SELECT id,kind,status,filename,created_at,applied_at,undone_at,row_count,
      error_count,imported_by FROM public.import_batches
     ORDER BY created_at DESC LIMIT 30`,
  )
  return { batches: result.rows }
}
