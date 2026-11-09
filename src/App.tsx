import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { findProducts, normalizeCode, formatDate, formatVnd, priceFor, stockState } from './domain'
import { findCachedByCompanyCode } from './cache'
import ExcelImport from './ExcelImport'
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

function ProductPreview({ product, snapshot }: { product: ProductRecord | null; snapshot: CatalogSnapshot }) {
  const [allPrices, setAllPrices] = useState(false)
  const defaultType = snapshot.priceTypes.find((p) => p.id === snapshot.defaultPriceTypeId) ?? null
  const quantity = product?.quantity ?? null
  const state = stockState(quantity)
  const stockLabel = state === 'available' ? 'Còn hàng' : state === 'empty' ? 'Hết hàng' : 'Chưa có dữ liệu'

  return (
    <section className="result-card" aria-label="Chi tiết sản phẩm">
      <div className="result-eyebrow">
        <span className={product ? 'label-green' : 'label-neutral'}>{product ? 'Kết quả tra cứu' : 'Khuôn hiển thị — chưa có dữ liệu'}</span>
        <span className="result-version">Snapshot Excel</span>
      </div>
      <div className="product-main">
        <div className="product-image">
          {product?.imageUrl
            ? <img src={product.imageUrl} alt={product.name || 'Hình sản phẩm'} loading="lazy" referrerPolicy="no-referrer" />
            : <Icon name="image" size={33} />}
        </div>
        <div className="product-info">
          <p className="eyebrow">THÔNG TIN SẢN PHẨM</p>
          <h2>{product?.name || (product ? 'Chưa có tên hàng' : 'Tên hàng sẽ hiện ở đây')}</h2>
          <p className="muted">Mã CTY: <strong>{product?.companyCode || '—'}</strong></p>
          <p className="muted">ĐVT: {product?.unit || 'Chưa có dữ liệu'}</p>
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
        <strong className="main-price">{product ? formatVnd(priceFor(product, snapshot.defaultPriceTypeId)) : 'Chưa có giá'}</strong>
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
                  <strong>{product ? formatVnd(priceFor(product, type.id)) : 'Chưa có giá'}</strong>
                </div>
              ))}
          </div>
        )}
      </div>
      <p className="result-footer"><Icon name="clock" size={14} /> Dữ liệu tại lần nhập Excel gần nhất · Không phải tồn realtime</p>
    </section>
  )
}

function Sidebar({isAdmin,onImport}: {isAdmin:boolean;onImport:()=>void}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-icon"><Icon name="box" size={27} /></span>
        <div><strong>STORE</strong><span>SALES INVENTORY</span></div>
      </div>
      <div className="menu-label">KHÔNG GIAN LÀM VIỆC</div>
      <nav aria-label="Điều hướng STORE" className="side-nav">
        <a href="#tra-cuu" className="nav-item nav-active" aria-current="page"><Icon name="search" size={20} />Tra cứu hàng hóa</a>
        <div className="nav-item nav-inactive" aria-disabled="true"><Icon name="list" size={20} />Danh mục <span>Sắp có</span></div>
        {isAdmin ? <button className="nav-item nav-button" type="button" onClick={onImport}><Icon name="upload" size={20} />Nhập Excel</button> : <div className="nav-item nav-inactive" aria-disabled="true"><Icon name="upload" size={20} />Nhập tồn Excel <span>Chỉ admin</span></div>}
        <div className="nav-item nav-inactive" aria-disabled="true"><Icon name="settings" size={20} />Thiết lập <span>Sắp có</span></div>
      </nav>
      <div className="sidebar-note"><span className="note-dot" /> <strong>Chưa kết nối dữ liệu</strong><p>Neon, xác thực và import Excel sẽ được cấu hình ở giai đoạn tiếp theo.</p></div>
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
  const [adminOpen,setAdminOpen] = useState(false)
  const [query, setQuery] = useState('')
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
  const product = exactResult && normalizeCode(exactResult.companyCode) === normalizeCode(query)
    ? exactResult : results[0] ?? null

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
    <div className="app">
      <Sidebar isAdmin={role === 'admin'} onImport={()=>setAdminOpen(true)} />
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs"><span>STORE</span><span className="crumb-divider">/</span><strong>Tra cứu sản phẩm</strong></div>
          <div className="top-actions"><span className="top-status"><span className="status-dot" />{isOnline ? (isLoading ? 'Đang đồng bộ' : 'Theo snapshot Excel') : 'Đang offline'}</span><span className="session-email">{userEmail}</span>{role === 'admin' && <button className="top-logout" type="button" onClick={()=>setAdminOpen(!adminOpen)}>{adminOpen ? 'Tra cứu' : 'Nhập Excel'}</button>}<button className="top-logout" onClick={onSignOut} type="button">Đăng xuất</button></div>
        </header>
        <main className="main" id="tra-cuu">
          {adminOpen && role === 'admin' ?
            <ExcelImport apiBase={apiBase} getToken={getAdminToken} onClose={()=>setAdminOpen(false)} onSaved={onReload} />
          : <>
          <div className="hero">
            <span className="hero-tag"><span className="mini-glow" /> DÀNH CHO NHÂN VIÊN KINH DOANH</span>
            <h1>Tra hàng nhanh.<br /><span>Chốt giá tự tin.</span></h1>
            <p>Một mã hàng, một giá mặc định, số tồn rõ ràng. Cần giá khác thì mở bảng giá tổng.</p>
          </div>
          <div className="sync-row" role="status"><span>{isLoading ? 'Đang tải dữ liệu STORE...' : (catalogStatus || 'Danh mục chưa có dữ liệu nhập Excel')}</span><button type="button" onClick={onReload} disabled={isLoading || !isOnline}>Đồng bộ lại</button></div>
          <div className="columns">
            <div className="left-column">
              <section className="search-panel" aria-labelledby="search-title">
                <div className="panel-title"><div><p className="eyebrow">TRA CỨU</p><h2 id="search-title">Tìm sản phẩm</h2></div><span className="shortcut-hint">Mã CTY ưu tiên</span></div>
                <label htmlFor="store-search" className="field-label">Mã CTY, SKU hoặc tên hàng</label>
                <div className="search-control">
                  <Icon name="search" size={22} />
                  <input id="store-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" spellCheck={false} placeholder="Nhập mã sản phẩm..." />
                </div>
                <div className="search-tags"><span>Tìm chính xác theo mã</span><span>Gợi ý theo tên</span><span>Hỗ trợ số 0 đầu</span></div>
              </section>
              {query.trim() !== '' && !product && (
                <div className="search-warning" role="status"><Icon name="wifi" size={17} />{snapshot.products.length === 0 ? 'Chưa có danh mục được nhập Excel.' : 'Không tìm thấy sản phẩm theo từ khóa này.'}</div>
              )}
              <ProductPreview product={product} snapshot={snapshot} />
            </div>
            <aside className="right-column" aria-label="Thông tin hệ thống">
              <section className="aside-card">
                <span className="aside-icon"><Icon name="check" size={20} /></span>
                <h3>Thiết kế cho tốc độ</h3>
                <p>Gõ mã để tìm, nhìn ngay giá được chọn mặc định và số tồn theo Excel.</p>
                <div className="feature-line"><span>01</span><p>Tra cứu qua IndexedDB sau khi đăng nhập và đồng bộ.</p></div>
                <div className="feature-line"><span>02</span><p>Đổi sang “Tất cả giá” ngay trên thẻ sản phẩm.</p></div>
                <div className="feature-line"><span>03</span><p>Hiển thị rõ thời điểm nhập dữ liệu tồn kho.</p></div>
              </section>
              <section className="aside-card secondary">
                <p className="eyebrow">TRẠNG THÁI MVP</p>
                <h3>Bộ khung PWA</h3>
                <p>Giao diện đã sẵn sàng để tích hợp Neon, nhập danh mục/giá/tồn và ảnh R2 chỉ đọc.</p>
                <span className="not-connected">Chưa có dữ liệu công ty</span>
              </section>
            </aside>
          </div>
          </>}
        </main>
        <footer className="footer"><span>STORE · Ứng dụng tra cứu bán hàng</span><span>Snapshot Excel, không phải tồn realtime</span></footer>
      </div>
    </div>
  )
}
