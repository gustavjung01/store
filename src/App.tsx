import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { findProducts, normalizeCode, formatDate, formatVnd, priceFor, stockState } from './domain'
import { findCachedByCompanyCode } from './cache'
import ExcelImport from './ExcelImport'
import CatalogManager from './CatalogManager'
import type { CatalogSnapshot, PriceType, ProductRecord } from './domain'

type IconName = 'search' | 'box' | 'list' | 'upload' | 'settings' | 'image' | 'chevron' | 'clock' | 'check' | 'wifi' | 'arrow'

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
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{drawing[name]}</svg>
}

function ProductPreview({ product, snapshot }: { product: ProductRecord; snapshot: CatalogSnapshot }) {
  const [allPrices, setAllPrices] = useState(false)
  const defaultType = snapshot.priceTypes.find((p) => p.id === snapshot.defaultPriceTypeId) ?? null
  const quantity = product.quantity
  const state = stockState(quantity)
  const stockLabel = state === 'available' ? 'Còn hàng' : state === 'empty' ? 'Hết hàng' : 'Chưa có dữ liệu'

  return (
    <section className="result-card" aria-label="Chi tiết sản phẩm">
      <div className="result-eyebrow">
        <span className="label-green">Thông tin hàng hóa</span>
        <span className="result-version">Dữ liệu đã đồng bộ</span>
      </div>
      <div className="product-main">
        <div className="product-image">
          {product.imageUrl
            ? <img src={product.imageUrl} alt={product.name || 'Hình sản phẩm'} loading="lazy" referrerPolicy="no-referrer" />
            : <Icon name="image" size={33} />}
        </div>
        <div className="product-info">
          <p className="eyebrow">THÔNG TIN SẢN PHẨM</p>
          <h2>{product.name || 'Chưa có tên hàng'}</h2>
          <p className="muted">Mã CTY: <strong>{product.companyCode}</strong></p>
          <p className="muted">ĐVT: {product.unit || 'Chưa có dữ liệu'}</p>
        </div>
      </div>
      <div className="metric-row">
        <div>
          <p className="eyebrow">TỒN KHO</p>
          <div className="stock-line">
            <strong className="stock-number">{quantity === null ? '—' : quantity.toLocaleString('vi-VN')}</strong>
            <span className={'stock-badge stock-' + state}>{stockLabel}</span>
          </div>
        </div>
        <div className="metric-time">
          <Icon name="clock" size={15} />
          <span>{formatDate(product?.inventoryUpdatedAt ?? null)}</span>
        </div>
      </div>
      <div className="price-panel">
        <div className="price-heading">
          <span>{defaultType?.label || 'GIÁ MẶC ĐỊNH'}</span>
          <span className="price-flag">ĐANG HIỂN THỊ</span>
        </div>
        <strong className="main-price">{formatVnd(priceFor(product, snapshot.defaultPriceTypeId))}</strong>
        <button className="price-toggle" type="button" aria-expanded={allPrices} onClick={() => setAllPrices(!allPrices)}>
          {allPrices ? 'Thu gọn bảng giá' : 'Xem tất cả giá'}
          <span className={allPrices ? 'rotate-icon' : ''}><Icon name="chevron" size={18} /></span>
        </button>
        {allPrices && (
          <div className="price-list">
            {snapshot.priceTypes.length === 0
              ? <p className="price-unavailable">Chưa có loại giá nào. Admin sẽ cấu hình sau khi import danh mục Excel.</p>
              : snapshot.priceTypes.map((type: PriceType) => (
                <div className="price-list-row" key={type.id}>
                  <span>{type.label}{type.id === snapshot.defaultPriceTypeId ? ' · mặc định' : ''}</span>
                  <strong>{formatVnd(priceFor(product, type.id))}</strong>
                </div>
              ))}
          </div>
        )}
      </div>
      <p className="result-footer"><Icon name="clock" size={14} /> Dữ liệu tại lần nhập Excel gần nhất · Không phải tồn realtime</p>
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
      <div className="brand">
        <span className="brand-icon"><Icon name="box" size={27} /></span>
        <div><strong>STORE</strong><span>SALES INVENTORY</span></div>
      </div>
      <div className="menu-label">ĐIỀU HƯỚNG</div>
      <nav aria-label="Điều hướng STORE" className="side-nav">
        <button className={'nav-item nav-button' + (pane === 'search' ? ' nav-active' : '')} type="button" aria-current={pane === 'search' ? 'page' : undefined} onClick={() => onNavigate('search')}><Icon name="search" size={20} />Tra cứu hàng hóa</button>
        <button className={'nav-item nav-button' + (pane === 'catalog' ? ' nav-active' : '')} type="button" aria-current={pane === 'catalog' ? 'page' : undefined} onClick={() => onNavigate('catalog')}><Icon name="list" size={20} />Danh mục</button>
        {isAdmin ? <button className={'nav-item nav-button' + (pane === 'excel' ? ' nav-active' : '')} type="button" aria-current={pane === 'excel' ? 'page' : undefined} onClick={() => onNavigate('excel')}><Icon name="upload" size={20} />Nhập Excel</button> : <div className="nav-item nav-inactive" aria-disabled="true"><Icon name="upload" size={20} />Nhập tồn Excel <span>Chỉ admin</span></div>}
        
      </nav>
      <div className="sidebar-note"><span className="note-dot" /> <strong>Ảnh chụp tồn kho</strong><p>Số tồn lấy từ lần nhập Excel gần nhất, không phải tồn realtime.</p></div>
    </aside>
  )
}

interface AppProps {
  snapshot: CatalogSnapshot
  catalogStatus: string
  cacheScope: string | null
  userEmail: string
  isLoading: boolean
  onReload: () => void
  onSignOut: () => void
  role: 'admin' | 'viewer' | null
  apiBase: string
  getAdminToken: () => Promise<string>
}

export default function App({ snapshot, catalogStatus, cacheScope, userEmail, isLoading, onReload, onSignOut, role, apiBase, getAdminToken }: AppProps) {
  const [pane, setPane] = useState<Pane>(paneFromHash)
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
          <div className="breadcrumbs"><span className="mobile-brand"><span className="mobile-brand-mark"><Icon name="box" size={19} /></span>STORE</span><span className="desktop-crumb">STORE <span className="crumb-divider">/</span></span><strong>{pane === 'catalog' ? 'Danh mục' : pane === 'excel' ? 'Nhập Excel' : 'Tra cứu'}</strong></div>
          <div className="top-actions"><span className="top-status"><span className="status-dot" />{isOnline ? (isLoading ? 'Đang đồng bộ' : 'Đã kết nối') : 'Ngoại tuyến'}</span><span className="session-email">{userEmail}</span>{role === 'admin' && <button className="top-logout" type="button" onClick={() => navigate(pane === 'excel' ? 'search' : 'excel')}>{pane === 'excel' ? 'Tra cứu' : 'Nhập Excel'}</button>}<button className="top-logout" onClick={onSignOut} type="button">Đăng xuất</button></div>
        </header>
        <main ref={mainRef} className="main" id={pane === 'catalog' ? 'danh-muc' : pane === 'excel' ? 'nhap-excel' : 'tra-cuu'}>
          {pane === 'catalog' ? (
            <CatalogManager snapshot={snapshot} isAdmin={role === 'admin'} apiBase={apiBase}
              getAdminToken={getAdminToken} onSaved={onReload} onClose={() => navigate('search')}
              isLoading={isLoading} isOnline={isOnline} />
          ) : pane === 'excel' && role === 'admin' ? (
            <ExcelImport apiBase={apiBase} getToken={getAdminToken} onClose={() => navigate('search')} onSaved={onReload} />
          ) : <>
          <div className="hero">
            <span className="hero-tag">TRA CỨU HÀNG HÓA</span>
            <h1>Mã hàng, giá & <span>tồn kho</span></h1>
            <p>Nhập mã công ty hoặc tên hàng để xem thông tin đã đồng bộ.</p>
          </div>
          <div className="sync-row" role="status"><span><Icon name="clock" size={16} />{!isOnline ? 'Đang dùng dữ liệu đã lưu trên máy, nếu có' : isLoading ? 'Đang đồng bộ dữ liệu...' : (catalogStatus || 'Chưa có dữ liệu danh mục được đồng bộ')}</span><button type="button" onClick={onReload} disabled={isLoading || !isOnline}>Làm mới</button></div>
          <div className="columns">
            <div className="left-column">
              <section className="search-panel" aria-labelledby="search-title">
                <div className="panel-title"><div><h2 id="search-title">Tìm sản phẩm</h2></div><span className="shortcut-hint">Ưu tiên mã CTY</span></div>
                <label htmlFor="store-search" className="field-label">Mã CTY, SKU hoặc tên hàng</label>
                <div className="search-control">
                  <Icon name="search" size={22} />
                  <input id="store-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedCode(null) }} autoComplete="off" spellCheck={false} placeholder="Nhập mã hoặc tên hàng..." />
                </div>
                {query.trim() && results.length > 1 ? <div className="search-suggestions" aria-label="Các sản phẩm phù hợp">
                  <div className="suggestions-heading">{results.length} kết quả phù hợp · Chọn để xem</div>
                  {results.slice(0, 6).map((item) => (
                    <button type="button" key={item.companyCode} className={'suggestion' + (product?.companyCode === item.companyCode ? ' chosen' : '')}
                      aria-pressed={product?.companyCode === item.companyCode}
                      onClick={() => setSelectedCode(item.companyCode)}>
                      <span><strong>{item.companyCode}</strong><small>{item.name || 'Chưa có tên hàng'}</small></span>
                      <Icon name="arrow" size={16} />
                    </button>
                  ))}
                </div> : null}
              </section>
              {query.trim() !== '' && !product && (
                <div className="search-warning" role="status"><Icon name="wifi" size={17} />{snapshot.products.length === 0 ? 'Chưa có danh mục được nhập Excel.' : 'Không tìm thấy sản phẩm theo từ khóa này.'}</div>
              )}
              {product ? <ProductPreview key={product.companyCode} product={product} snapshot={snapshot} /> : query.trim() ? null : (
                <section className="search-empty" aria-label="Hướng dẫn tra cứu">
                  <span className="empty-mark"><Icon name="search" size={24} /></span>
                  <h2>Sẵn sàng tra cứu</h2>
                  <p>Nhập mã CTY, SKU hoặc tên sản phẩm phía trên. Thông tin chỉ hiển thị sau khi tìm thấy mã thực tế.</p>
                  <span>{snapshot.products.length.toLocaleString('vi-VN')} mã trong danh mục đã đồng bộ</span>
                </section>
              )}
            </div>
          </div>
          </>}
        </main>
        <nav className="mobile-store-nav" aria-label="Điều hướng chính trên điện thoại">
          <button type="button" className={pane === 'search' ? 'active' : ''} aria-current={pane === 'search' ? 'page' : undefined} onClick={() => navigate('search')}><Icon name="search" size={21} /><span>Tra cứu</span></button>
          <button type="button" className={pane === 'catalog' ? 'active' : ''} aria-current={pane === 'catalog' ? 'page' : undefined} onClick={() => navigate('catalog')}><Icon name="list" size={21} /><span>Danh mục</span></button>
          {role === 'admin' && <button type="button" className={pane === 'excel' ? 'active' : ''} aria-current={pane === 'excel' ? 'page' : undefined} onClick={() => navigate('excel')}><Icon name="upload" size={21} /><span>Nhập Excel</span></button>}
        </nav>
        <footer className="footer"><span>STORE · Ứng dụng tra cứu bán hàng</span><span>Snapshot Excel, không phải tồn realtime</span></footer>
      </div>
    </div>
  )
}
