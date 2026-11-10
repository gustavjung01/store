import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { findProducts, normalizeCode, formatDate, formatVnd, priceFor, stockState } from './domain'
import { findCachedByCompanyCode } from './cache'
import { safeProductSpec, wholesaleConversion } from './productSpec'
import { knownProductFactCount, productFactGroups } from './productFacts'
import ExcelImport from './ExcelImport'
import CatalogManager from './CatalogManager'
import type { CatalogSnapshot, PriceType, ProductRecord } from './domain'

type IconName = 'search' | 'box' | 'list' | 'upload' | 'settings' | 'image' | 'chevron' | 'clock' | 'check' | 'wifi' | 'arrow' | 'sun' | 'moon' | 'refresh'

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const drawing: Record<IconName, ReactNode> = {
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 5 5" /></>,
    box: <><path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7M12 11v10" /></>,
    list: <><path d="M9 6h12M9 12h12M9 18h12" /><path d="M3 6h2M3 12h2M3 18h2" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m12 2 1.5 2.2 2.6.5 2.1-1.2 2.2 2.2-1.2 2.1.5 2.7L22 12l-2.3 1.5-.5 2.6 1.2 2.1-2.2 2.2-2.1-1.2-2.6.5L12 22l-1.5-2.3-2.6-.5-2.1 1.2-2.2-2.2 1.2-2.1-.5-2.6L2 12l2.3-1.5.5-2.7-1.2-2.1 2.2-2.2 2.1 1.2 2.6-.5L12 2Z" /></>,
    image: <><rect x="2" y="3" width="20" height="18" rx="3" /><circle cx="8" cy="9" r="2" /><path d="m4 19 6-6 4 4 3-3 5 5" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    check: <path d="m4 12 5 5L20 6" />,
    wifi: <><path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M9 16a5 5 0 0 1 6 0" /><circle cx="12" cy="20" r="1" /></>,
    arrow: <><path d="M4 12h16m-7-7 7 7-7 7" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    moon: <path d="M20.5 14.4A8.5 8.5 0 0 1 9.6 3.5 8.5 8.5 0 1 0 20.5 14.4Z" />,
    refresh: <><path d="M20 11a8 8 0 1 0-2.2 5.5" /><path d="M20 4v7h-7" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{drawing[name]}</svg>
}

function ProductPreview({ product, snapshot }: { product: ProductRecord; snapshot: CatalogSnapshot }) {
  const [allPrices, setAllPrices] = useState(false)
  const defaultType = snapshot.priceTypes.find((p) => p.id === snapshot.defaultPriceTypeId) ?? null
  const quantity = product.quantity
  const state = stockState(quantity)
  const spec = safeProductSpec(product.productSpec)
  const carton = wholesaleConversion(quantity, product.unit, spec)
  const number = (value: number) => value.toLocaleString('vi-VN')
  const factGroups = productFactGroups(product)
  const knownFactCount = knownProductFactCount(factGroups)
  const totalFactCount = factGroups.reduce((total, group) => total + group.facts.length, 0)
  const stockLabel = state === 'available' ? 'Còn hàng' : state === 'empty' ? 'Hết hàng' : 'Chưa có dữ liệu'

  return (
    <section className="result-card" aria-label="Chi tiết sản phẩm">
      <div className="product-main">
        <div className="product-image">
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name || 'Hình sản phẩm'} loading="lazy" referrerPolicy="no-referrer" />
            : <Icon name="image" size={33} />}
        </div>
        <div className="product-info">
          <h2>{product.name || 'Chưa có tên hàng'}</h2>
          <p className="muted">Mã CTY: <strong>{product.companyCode}</strong></p>
          <p className="muted">ĐVT: <strong>{product.unit || 'Chưa xác nhận'}</strong></p>
        </div>
      </div>
      <div className="metric-row">
        <div>
          <p className="eyebrow">TỒN KHO</p>
          <div className="stock-line">
            <strong className="stock-number">{quantity === null ? '—' : quantity.toLocaleString('vi-VN')}</strong>
            {quantity !== null && product.unit && <span className="stock-unit">{product.unit}</span>}
            <span className={'stock-badge stock-' + state}>{stockLabel}</span>
          </div>
        </div>
        <div className="metric-time">
          <Icon name="clock" size={15} />
          <span>Nhập tồn: {formatDate(product?.inventoryUpdatedAt ?? null)}</span>
        </div>
      </div>
      <section className="product-attributes" aria-label="Thuộc tính sản phẩm">
        <div className="product-attributes-header">
          <h3>Thuộc tính sản phẩm</h3>
          <span>{knownFactCount}/{totalFactCount} thông tin đã có</span>
        </div>
        <div className="product-attribute-groups">
          {factGroups.map(group => (
            <section className="product-attribute-group" aria-label={group.title} key={group.key}>
              <h4>{group.title}</h4>
              <dl className="product-attribute-list">
                {group.facts.map(fact => (
                  <div className="product-attribute-row" key={fact.key}>
                    <dt>{fact.label}</dt>
                    <dd className={fact.value === null ? 'product-attribute-missing' : ''}>
                      {fact.value ?? 'Chưa cập nhật'}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        {knownFactCount === 0 && <p className="product-attributes-notice">Sản phẩm này chưa có thuộc tính được lưu. STORE không tự suy đoán thông số từ tên hàng.</p>}
        {(carton.piecesPerCarton !== null && spec.pieceUnit) && (
          <div className="product-attribute-conversion" aria-label="Quy đổi tồn từ quy cách đã lưu">
            <p className="carton-fact"><strong>1 thùng</strong> = <strong>{number(carton.piecesPerCarton)} {spec.pieceUnit}</strong></p>
            {carton.totalPieces !== null && quantity !== null && <p className="carton-equivalent">Tồn quy đổi: {number(carton.totalPieces)} {spec.pieceUnit} (từ {number(quantity)} thùng)</p>}
            {carton.fullCartons !== null && carton.remainder !== null && <p className="carton-equivalent">Tương đương {number(carton.fullCartons)} thùng + {number(carton.remainder)} {spec.pieceUnit} lẻ</p>}
          </div>
        )}
      </section>
      <div className="price-panel">
        <div className="price-heading">
          <span>{defaultType?.label || 'GIÁ MẶC ĐỊNH'}</span>
        </div>
        <strong className="main-price">{formatVnd(priceFor(product, snapshot.defaultPriceTypeId))}</strong>
        <button className="price-toggle" type="button" aria-expanded={allPrices} onClick={() => setAllPrices(!allPrices)}>
          {allPrices ? 'Thu gọn bảng giá' : 'Xem tất cả giá'}
          <span className={allPrices ? 'rotate-icon' : ''}><Icon name="chevron" size={18} /></span>
        </button>
        {allPrices && (
          <div className="price-list">
            {snapshot.priceTypes.length === 0
              ? <p className="price-unavailable">Chưa có bảng giá.</p>
              : snapshot.priceTypes.map((type: PriceType) => (
                <div className="price-list-row" key={type.id}>
                  <span>{type.label}{type.id === snapshot.defaultPriceTypeId ? ' · mặc định' : ''}</span>
                  <strong>{formatVnd(priceFor(product, type.id))}</strong>
                </div>
              ))}
          </div>
        )}
      </div>
      <p className="result-footer">Tồn theo lần nhập Excel gần nhất</p>
    </section>
  )
}

type Pane = 'search' | 'catalog' | 'excel'
function paneFromHash(): Pane {
  return window.location.hash === '#danh-muc' ? 'catalog'
    : window.location.hash === '#nhap-excel' ? 'excel' : 'search'
}

function Sidebar({ isAdmin, pane, onNavigate }: { isAdmin: boolean; pane: Pane; onNavigate: (pane: Pane) => void }) {
  return (
    <aside className="sidebar">
      <nav aria-label="Điều hướng STORE" className="side-nav">
        <button className={'nav-item nav-button' + (pane === 'search' ? ' nav-active' : '')} type="button" aria-current={pane === 'search' ? 'page' : undefined} onClick={() => onNavigate('search')}><Icon name="search" size={20} />Tra cứu</button>
        <button className={'nav-item nav-button' + (pane === 'catalog' ? ' nav-active' : '')} type="button" aria-current={pane === 'catalog' ? 'page' : undefined} onClick={() => onNavigate('catalog')}><Icon name="list" size={20} />Danh mục</button>
        {isAdmin && <button className={'nav-item nav-button' + (pane === 'excel' ? ' nav-active' : '')} type="button" aria-current={pane === 'excel' ? 'page' : undefined} onClick={() => onNavigate('excel')}><Icon name="upload" size={20} />Nhập Excel</button>}
      </nav>
    </aside>
  )
}

interface AppProps {
  snapshot: CatalogSnapshot
  cacheScope: string | null
  isLoading: boolean
  onReload: () => void
  onSignOut: () => void
  role: 'admin' | 'viewer' | null
  apiBase: string
  getAdminToken: () => Promise<string>
}

export default function App({ snapshot, cacheScope, isLoading, onReload, onSignOut, role, apiBase, getAdminToken }: AppProps) {
  const [pane, setPane] = useState<Pane>(paneFromHash)
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )
  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    // Apply synchronously; storage may be blocked in private browser contexts.
    document.documentElement.dataset.theme = next
    document.documentElement.style.colorScheme = next
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0d1118' : '#f5f7fb')
    try { window.localStorage.setItem('store-theme', next) } catch { /* memory-only fallback */ }
    setTheme(next)
  }
  const mainRef = useRef<HTMLElement>(null)
  const [editingField, setEditingField] = useState(false)
  useEffect(() => {
    const onHashChange = () => setPane(paneFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  function navigate(next: Pane) {
    setPane(next)
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' })
    const hash = next === 'catalog' ? '#danh-muc' : next === 'excel' ? '#nhap-excel' : '#tra-cuu'
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + hash)
  }
  const [query, setQuery] = useState('')
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const results = useMemo(() => findProducts(snapshot.products, query), [snapshot.products, query])
  const [exactResult, setExactResult] = useState<ProductRecord | null>(null)
  useEffect(() => {
    let active = true
    setExactResult(null)
    if (cacheScope && query.trim()) {
      void findCachedByCompanyCode(cacheScope, query).then((value) => {
        if (active) setExactResult(value)
      }).catch(() => {})
    }
    return () => { active = false }
  }, [cacheScope, query, snapshot])
  const selectedResult = results.find((item) => item.companyCode === selectedCode)
  const product = selectedResult ?? (exactResult && normalizeCode(exactResult.companyCode) === normalizeCode(query)
    ? exactResult : results[0] ?? null)

  useEffect(() => {
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  return (
    <div className={'app' + (editingField ? ' is-editing' : '')}
      onFocusCapture={(event) => {
        const target = event.target
        setEditingField(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)
      }}
      onBlurCapture={() => setEditingField(false)}>
      <Sidebar isAdmin={role === 'admin'} pane={pane} onNavigate={navigate} />
      <div className="workspace">
        <header className="topbar">
          <div className="top-brand" aria-label="STORE"><span className="top-brand-mark"><Icon name="box" size={19} /></span><strong>STORE</strong></div>
          <button type="button" className="theme-toggle" role="switch" aria-checked={theme === 'dark'}
            aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
            title={theme === 'dark' ? 'Đang dùng giao diện tối' : 'Đang dùng giao diện sáng'} onClick={toggleTheme}>
            <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={16} />
            <span>{theme === 'dark' ? 'Tối' : 'Sáng'}</span>
            <span className={'theme-track' + (theme === 'dark' ? ' is-dark' : '')} aria-hidden="true"><span /></span>
          </button>
          <div className="top-actions"><button className="top-logout" onClick={onSignOut} type="button">Đăng xuất</button></div>
        </header>
        <main ref={mainRef} className={pane === 'search' ? 'main main-search' : 'main'} id={pane === 'catalog' ? 'danh-muc' : pane === 'excel' ? 'nhap-excel' : 'tra-cuu'}>
          {pane === 'catalog' ? (
            <CatalogManager snapshot={snapshot} isAdmin={role === 'admin'} apiBase={apiBase}
              getAdminToken={getAdminToken} onSaved={onReload} onClose={() => navigate('search')}
              isLoading={isLoading} isOnline={isOnline} />
          ) : pane === 'excel' && role === 'admin' ? (
            <ExcelImport apiBase={apiBase} getToken={getAdminToken} onClose={() => navigate('search')} onSaved={onReload} />
          ) : <>
          <div className="columns">
            <div className="left-column">
              <section className="search-panel" aria-label="Tìm sản phẩm">
                <div className="search-control">
                  <Icon name="search" size={22} />
                  <input id="store-search" aria-label="Nhập mã CTY, SKU hoặc tên hàng" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedCode(null) }} autoComplete="off" spellCheck={false} placeholder="Tìm mã CTY, SKU hoặc tên hàng..." />
                  <button className="search-refresh" type="button" aria-label="Làm mới dữ liệu" title="Làm mới" onClick={onReload} disabled={isLoading || !isOnline}><Icon name="refresh" size={19}/></button>
                </div>
                {query.trim() && results.length > 1 ? <div className="search-suggestions" aria-label="Các sản phẩm phù hợp">
                  {results.slice(0, 6).map((item) => (
                    <button type="button" key={item.companyCode} className={'suggestion' + (product?.companyCode === item.companyCode ? ' chosen' : '')}
                      aria-pressed={product?.companyCode === item.companyCode}
                      onClick={() => setSelectedCode(item.companyCode)}>
                      <span><strong>{item.companyCode}</strong><small>{item.name || 'Chưa có tên hàng'}</small></span>
                      <Icon name="arrow" size={16} />
                    </button>
                  ))}
                </div> : null}
                {(!isOnline || isLoading) && <p className="search-feedback" role="status">{!isOnline ? 'Đang ngoại tuyến · Dữ liệu có thể cũ' : 'Đang cập nhật...'}</p>}
              </section>
              {query.trim() !== '' && !product && (
                <div className="search-warning" role="status"><Icon name="search" size={17} />{snapshot.products.length === 0 ? 'Chưa có danh mục được nhập Excel.' : 'Không tìm thấy sản phẩm theo từ khóa này.'}</div>
              )}
              {product ? <ProductPreview key={product.companyCode} product={product} snapshot={snapshot} /> : (!query.trim() && snapshot.products.length === 0 ? <p className="search-feedback" role="status">Chưa có sản phẩm.</p> : null)}
            </div>
          </div>
          </>}
        </main>
        <nav className="mobile-store-nav" aria-label="Điều hướng chính trên điện thoại">
          <button type="button" className={pane === 'search' ? 'active' : ''} aria-current={pane === 'search' ? 'page' : undefined} onClick={() => navigate('search')}><Icon name="search" size={21} /><span>Tra cứu</span></button>
          <button type="button" className={pane === 'catalog' ? 'active' : ''} aria-current={pane === 'catalog' ? 'page' : undefined} onClick={() => navigate('catalog')}><Icon name="list" size={21} /><span>Danh mục</span></button>
          {role === 'admin' && <button type="button" className={pane === 'excel' ? 'active' : ''} aria-current={pane === 'excel' ? 'page' : undefined} onClick={() => navigate('excel')}><Icon name="upload" size={21} /><span>Nhập Excel</span></button>}
        </nav>
      </div>
    </div>
  )
}
