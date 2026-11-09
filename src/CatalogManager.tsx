import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { formatVnd, normalizeCode, priceFor, stockState } from './domain'
import type { CatalogSnapshot, ProductRecord } from './domain'

type Editor = {
  mode: 'create' | 'update'
  companyCode: string
  name: string
  sku: string
  unit: string
  category: string
}

type EditEvent = {
  id: string
  company_code: string
  action: 'create' | 'update'
  created_at: string
  before_data: { name?: string | null } | null
  after_data: { name?: string | null }
}

const blank: Editor = { mode: 'create', companyCode: '', name: '', sku: '', unit: '', category: '' }
const friendly = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

export default function CatalogManager({
  snapshot, isAdmin, apiBase, getAdminToken, onSaved, onClose, isLoading, isOnline,
}: {
  snapshot: CatalogSnapshot
  isAdmin: boolean
  apiBase: string
  getAdminToken: () => Promise<string>
  onSaved: () => void
  onClose: () => void
  isLoading: boolean
  isOnline: boolean
}) {
  const [query, setQuery] = useState('')
  const [onlyUnnamed, setOnlyUnnamed] = useState(false)
  const [visible, setVisible] = useState(40)
  const [editor, setEditor] = useState<Editor | null>(null)
  const editorBaseline = useRef<Editor | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!message) return
    const dismiss = window.setTimeout(() => setMessage(''), 4800)
    return () => window.clearTimeout(dismiss)
  }, [message])
  const [edits, setEdits] = useState<EditEvent[]>([])
  const [historyError, setHistoryError] = useState('')

  const unnamed = useMemo(
    () => snapshot.products.filter(p => !p.name?.trim()).length, [snapshot.products],
  )
  const filtered = useMemo(() => {
    const term = friendly(query.trim())
    return snapshot.products.filter(p => {
      if (onlyUnnamed && p.name?.trim()) return false
      return !term || [p.companyCode, p.sku, p.name, p.unit, p.category]
        .some(value => value && friendly(value).includes(term))
    }).sort((a, b) => {
      // Highlight incomplete names first, then natural company-code order.
      const incompleteDiff = Number(!b.name?.trim()) - Number(!a.name?.trim())
      return incompleteDiff || a.companyCode.localeCompare(b.companyCode, 'vi', { numeric: true })
    })
  }, [snapshot.products, query, onlyUnnamed])

  useEffect(() => { setVisible(40) }, [query, onlyUnnamed])

  const loadEdits = useCallback(async () => {
    if (!isAdmin) return
    try {
      const jwt = await getAdminToken()
      const response = await fetch(new URL('admin/catalog/edits', apiBase), {
        headers: { Authorization: 'Bearer ' + jwt },
        cache: 'no-store', redirect: 'error',
      })
      if (!response.ok) throw new Error('Không đọc được lịch sử sửa sản phẩm')
      const data: unknown = await response.json()
      if (!data || typeof data !== 'object' || !('edits' in data)) throw new Error('Lịch sử không hợp lệ')
      const rows = (data as { edits?: unknown }).edits
      setEdits(Array.isArray(rows) ? rows as EditEvent[] : [])
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : 'Không thể tải lịch sử')
    }
  }, [isAdmin, apiBase, getAdminToken])

  useEffect(() => {
    if (isAdmin && isOnline) void loadEdits()
  }, [isAdmin, isOnline, loadEdits])

  function startEdit(product: ProductRecord) {
    const original: Editor = {
      mode: 'update', companyCode: product.companyCode, name: product.name ?? '',
      sku: product.sku ?? '', unit: product.unit ?? '', category: product.category ?? '',
    }
    editorBaseline.current = original
    setEditor({ ...original })
    setError('');setMessage('')
  }

  function startCreate() {
    editorBaseline.current = { ...blank }
    setEditor({ ...blank })
    setError('');setMessage('')
  }

  function closeEditor() {
    if (!editor || saving) return
    if (JSON.stringify(editor) !== JSON.stringify(editorBaseline.current) &&
      !window.confirm('Thông tin chưa lưu sẽ bị bỏ qua. Đóng cửa sổ chỉnh sửa?')) return
    setEditor(null)
    editorBaseline.current = null
  }

  useEffect(() => {
    if (!editor) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTask = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus()
    })
    return () => {
      window.cancelAnimationFrame(focusTask)
      previouslyFocused?.focus()
    }
  }, [Boolean(editor)])

  useEffect(() => {
    if (!editor) return
    function onDialogKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeEditor()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
      )).filter(element => element.getClientRects().length > 0)
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', onDialogKeyDown)
    return () => document.removeEventListener('keydown', onDialogKeyDown)
  }, [editor, saving])

  function patch(patch: Partial<Editor>) {
    setEditor(old => old ? { ...old, ...patch } : null)
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || !isAdmin) return
    setError('');setMessage('')
    if (!isOnline) { setError('Cần có mạng để ghi danh mục STORE'); return }
    if (!snapshot.version) { setError('Cần đồng bộ danh mục mới nhất trước khi lưu'); return }
    if (!editor.companyCode.trim() || !editor.name.trim()) {
      setError('Mã CTY và tên hàng là hai trường bắt buộc')
      return
    }
    setSaving(true)
    try {
      const jwt = await getAdminToken()
      const response = await fetch(new URL('admin/catalog/products', apiBase), {
        method: editor.mode === 'create' ? 'POST' : 'PATCH',
        headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyCode: editor.companyCode, name: editor.name,
          sku: editor.sku || null, unit: editor.unit || null,
          category: editor.category || null, expectedVersion: snapshot.version,
        }),
        cache: 'no-store', redirect: 'error',
      })
      const data: unknown = await response.json()
      if (!response.ok) {
        const detail = data && typeof data === 'object' && 'error' in data
          ? String((data as { error: unknown }).error) : 'Không lưu được sản phẩm'
        throw new Error(detail)
      }
      setEditor(null)
      editorBaseline.current = null
      setMessage('Đã lưu sản phẩm vào Neon. Đang đồng bộ lại danh mục để tra cứu.')
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được sản phẩm')
    } finally {
      setSaving(false)
    }
  }

  const defaultType = snapshot.priceTypes.find(t => t.id === snapshot.defaultPriceTypeId)
  return (
    <section className="catalog-page" aria-label="Danh mục sản phẩm STORE">
      <div className="catalog-titlebar">
        <div>
          <span className="hero-tag"><span className="mini-glow" /> DANH MỤC HÀNG HÓA</span>
          <h1>Danh mục <span>sản phẩm</span></h1>
          <p>Mỗi mã CTY gắn với tên hàng rõ ràng. Tồn kho vẫn cập nhật riêng từ Excel, không phải realtime.</p>
        </div>
        <div className="catalog-title-actions">
          {isAdmin && <button type="button" className="catalog-primary" onClick={startCreate}>+ Tạo sản phẩm</button>}
          <button type="button" className="catalog-secondary" onClick={onClose}>Về tra cứu</button>
        </div>
      </div>

      <div className="catalog-stats">
        <div><strong>{snapshot.products.length.toLocaleString('vi-VN')}</strong><span>Tổng mã CTY</span></div>
        <div><strong>{(snapshot.products.length - unnamed).toLocaleString('vi-VN')}</strong><span>Đã có tên hàng</span></div>
        <div className={unnamed ? 'needs-name' : ''}><strong>{unnamed.toLocaleString('vi-VN')}</strong><span>Chưa có tên · cần bổ sung</span></div>
      </div>

      {isAdmin && editor && (
        <div className="catalog-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeEditor() }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="catalog-dialog-title" className="catalog-dialog">
        <form className="catalog-form catalog-dialog-form" onSubmit={event => { void submit(event) }}>
          <div className="catalog-form-heading">
            <div><h2 id="catalog-dialog-title">{editor.mode === 'create' ? 'Tạo sản phẩm mới' : 'Hoàn thiện / sửa sản phẩm'}</h2></div>
            <button type="button" className="catalog-secondary" onClick={closeEditor} disabled={saving} aria-label="Đóng cửa sổ chỉnh sửa">Đóng</button>
          </div>
          <p className="catalog-dialog-hint">{editor.mode === 'create' ? 'Nhập mã thực tế và tên hàng, không cần khai tồn lúc này.' : 'Mã CTY không được thay đổi để bảo toàn giá và lịch sử tồn.'}</p>
          <div className="catalog-form-grid">
            <label><span>Mã CTY <b>*</b></span><input type="text" required maxLength={120} value={editor.companyCode}
              onChange={e => patch({ companyCode: e.target.value })} disabled={editor.mode === 'update' || saving}
              autoComplete="off" spellCheck={false} placeholder="Nhập đúng mã trên Excel" /></label>
            <label><span>Tên hàng <b>*</b></span><input type="text" required maxLength={400} value={editor.name}
              onChange={e => patch({ name: e.target.value })} disabled={saving} autoComplete="off" placeholder="Tên sản phẩm đầy đủ theo danh mục công ty" /></label>
            <label><span>SKU</span><input maxLength={120} value={editor.sku} onChange={e => patch({ sku: e.target.value })} disabled={saving} placeholder="Không bắt buộc" /></label>
            <label><span>Đơn vị tính</span><input maxLength={60} value={editor.unit} onChange={e => patch({ unit: e.target.value })} disabled={saving} placeholder="Ví dụ: cái, hộp... (chỉ là gợi ý)" /></label>
            <label className="catalog-category-field"><span>Nhóm hàng</span><input maxLength={120} value={editor.category} onChange={e => patch({ category: e.target.value })} disabled={saving} placeholder="Để trống nếu chưa phân nhóm" /></label>
          </div>
          <p className="catalog-form-note">Giá bán và số tồn không thay đổi khi lưu thông tin sản phẩm. Có thể nhập bảng giá và tồn từ Excel sau.</p>
          {error && <div className="catalog-error" role="alert">{error}</div>}
          <div className="catalog-form-actions">
            <button type="button" className="catalog-secondary" disabled={saving} onClick={closeEditor}>Hủy</button>
            <button type="submit" className="catalog-primary" disabled={saving || isLoading || !isOnline}>
              {saving ? 'Đang lưu...' : editor.mode === 'create' ? 'Tạo sản phẩm' : 'Lưu thông tin'}
            </button>
          </div>
        </form>
          </div>
        </div>
      )}

      {message && <div className="store-toast" role="status"><span>{message}</span><button type="button" aria-label="Đóng thông báo" onClick={() => setMessage('')}>×</button></div>}
      <div className="catalog-list">
        <div className="catalog-list-head">
          <div><h2>Danh sách sản phẩm</h2><p>Tra theo mã CTY, SKU hoặc tên hàng.</p></div>
          <button type="button" className="catalog-secondary" onClick={onSaved} disabled={isLoading || !isOnline}>Đồng bộ lại</button>
        </div>
        <div className="catalog-toolbar">
          <input type="search" aria-label="Tìm trong danh mục" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Tìm mã CTY / tên hàng / SKU..." autoComplete="off" />
          <label><input type="checkbox" checked={onlyUnnamed} onChange={e => setOnlyUnnamed(e.target.checked)} /> Chỉ xem mã thiếu tên</label>
        </div>
        {!filtered.length
          ? <div className="catalog-empty">{snapshot.products.length === 0 ? 'Chưa có sản phẩm. Admin có thể tạo từng sản phẩm hoặc nhập danh mục Excel.' : 'Không tìm thấy sản phẩm phù hợp.'}</div>
          : <div className="catalog-items">
            {filtered.slice(0, visible).map(item => {
              const currentState = stockState(item.quantity)
              return <article className="catalog-item" key={item.companyCode}>
                <div className="catalog-item-body">
                  <span className="catalog-code">{item.companyCode}</span>
                  <h3>{item.name?.trim() || <span className="catalog-unnamed">Chưa có tên hàng</span>}</h3>
                  <p>{[item.sku ? 'SKU: ' + item.sku : null, item.unit ? 'ĐVT: ' + item.unit : null, item.category].filter(Boolean).join(' · ') || 'Chưa có thông tin bổ sung'}</p>
                </div>
                <div className="catalog-item-meta">
                  <span className={'stock-badge stock-' + currentState}>{currentState === 'unknown' ? 'Chưa có tồn' : currentState === 'empty' ? 'Hết hàng' : 'Còn ' + item.quantity}</span>
                  <strong>{formatVnd(priceFor(item, snapshot.defaultPriceTypeId))}</strong>
                  <small>{defaultType?.label ?? 'Giá mặc định'}</small>
                </div>
                {isAdmin && <button className="catalog-edit" type="button" onClick={() => startEdit(item)}>
                  {item.name?.trim() ? 'Sửa' : 'Bổ sung tên'}
                </button>}
              </article>
            })}
          </div>}
        {filtered.length > visible && <button className="catalog-more" type="button" onClick={() => setVisible(v => v + 40)}>
          Xem thêm · {Math.min(visible, filtered.length)} / {filtered.length}
        </button>}
      </div>

      {isAdmin && <section className="catalog-audit">
        <h2>Nhật ký chỉnh sửa danh mục</h2>
        {historyError && <p className="catalog-hint">{historyError}</p>}
        {edits.length ? edits.slice(0, 8).map(entry => (
          <div className="catalog-audit-item" key={entry.id}>
            <span>{entry.action === 'create' ? 'Tạo' : 'Sửa'} <strong>{entry.company_code}</strong> · {entry.after_data?.name || 'Chưa có tên'}</span>
            <small>{new Date(entry.created_at).toLocaleString('vi-VN')}</small>
          </div>
        )) : <p className="catalog-hint">Chưa có thay đổi danh mục thủ công nào.</p>}
      </section>}
    </section>
  )
}
