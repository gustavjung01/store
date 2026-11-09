import { normalizeCode } from './domain'
import type { CatalogSnapshot, ProductRecord, PriceType } from './domain'

const VERSION = 1
const PREFIX = 'store-private-catalog-v1-'
const PRODUCT_STORE = 'products'
const META_STORE = 'meta'

type CachedProduct = ProductRecord & { codeKey: string }
type Metadata = { key: 'current'; priceTypes: PriceType[]; defaultPriceTypeId: string | null; syncedAt: string | null }

/**
 * Scope MUST come from a validated login session, not a value typed by the user.
 * Call clearPrivateCache on logout. Do not hydrate IndexedDB before server auth.
 */
function databaseName(sessionScope: string): string {
  if (!/^[\w:-]{8,128}$/.test(sessionScope)) throw new Error('Session scope không hợp lệ')
  return PREFIX + sessionScope
}

function openDatabase(sessionScope: string): Promise<IDBDatabase> {
  const name = databaseName(sessionScope)
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('Thiết bị không hỗ trợ IndexedDB'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const store = db.createObjectStore(PRODUCT_STORE, { keyPath: 'companyCode' })
      store.createIndex('by-code', 'codeKey', { unique: true })
      db.createObjectStore(META_STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Không mở được cache'))
  })
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Không đọc được cache'))
  })
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error || new Error('Cache transaction lỗi'))
    tx.onabort = () => reject(tx.error || new Error('Cache transaction bị hủy'))
  })
}

/** Atomic replacement: call only after permission-checked Neon snapshot arrives. */
export async function storeAuthorizedSnapshot(sessionScope: string, snapshot: CatalogSnapshot): Promise<void> {
  const db = await openDatabase(sessionScope)
  try {
    const tx = db.transaction([PRODUCT_STORE, META_STORE], 'readwrite')
    const done = completed(tx)
    const products = tx.objectStore(PRODUCT_STORE)
    products.clear()
    for (const product of snapshot.products) {
      const row: CachedProduct = { ...product, codeKey: normalizeCode(product.companyCode) }
      products.put(row)
    }
    const meta: Metadata = {
      key: 'current',
      priceTypes: snapshot.priceTypes,
      defaultPriceTypeId: snapshot.defaultPriceTypeId,
      syncedAt: snapshot.syncedAt,
    }
    tx.objectStore(META_STORE).put(meta)
    await done
  } finally {
    db.close()
  }
}

export async function findCachedByCompanyCode(sessionScope: string, companyCode: string): Promise<ProductRecord | null> {
  const key = normalizeCode(companyCode)
  if (!key) return null
  const db = await openDatabase(sessionScope)
  try {
    const tx = db.transaction(PRODUCT_STORE, 'readonly')
    const row = await requestValue(tx.objectStore(PRODUCT_STORE).index('by-code').get(key) as IDBRequest<CachedProduct | undefined>)
    if (!row) return null
    const { codeKey: _ignored, ...product } = row
    void _ignored
    return product
  } finally {
    db.close()
  }
}

export async function readAuthorizedSnapshot(sessionScope: string): Promise<CatalogSnapshot | null> {
  const db = await openDatabase(sessionScope)
  try {
    const tx = db.transaction([PRODUCT_STORE, META_STORE], 'readonly')
    const productsReq = tx.objectStore(PRODUCT_STORE).getAll() as IDBRequest<CachedProduct[]>
    const metaReq = tx.objectStore(META_STORE).get('current') as IDBRequest<Metadata | undefined>
    const [stored, meta] = await Promise.all([requestValue(productsReq), requestValue(metaReq)])
    if (!meta) return null
    return {
      products: stored.map(({ codeKey: _ignored, ...product }) => { void _ignored; return product }),
      priceTypes: meta.priceTypes,
      defaultPriceTypeId: meta.defaultPriceTypeId,
      syncedAt: meta.syncedAt,
    }
  } finally {
    db.close()
  }
}

export function clearPrivateCache(sessionScope: string): Promise<void> {
  const name = databaseName(sessionScope)
  if (!('indexedDB' in globalThis)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('Không xóa được cache'))
    request.onblocked = () => reject(new Error('Vui lòng đóng các tab STORE khác để xóa cache'))
  })
}
