import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { formatDate, formatVnd, normalizeCode, priceFor, stockState } from './domain'
import type { CatalogSnapshot, ProductRecord } from './domain'
import { normalizeProductSpec, safeProductSpec, piecesPerCarton } from './productSpec'
import type { ProductSpec } from './productSpec'

type Editor = {
  mode: 'create' | 'update'
  companyCode: string
  name: string
  sku: string
  unit: string
  category: string
  spec: Record<keyof ProductSpec, string>
}

type EditEvent = {
  id: string
  company_code: string
  action: 'create' | 'update'
  created_at: string
  before_data: { name?: string | null } | null
  after_data: { name?: string | null }
}

const specBlank: Record<keyof ProductSpec, string> = {
  paperSize: '', pages: '', ruling: '', gsm: '', coverType: '', pieceUnit: '',
  packUnit: '', unitsPerPack: '', packsPerCarton: '', unitsPerCarton: '', packagingNote: '',
}
function specForm(raw: ProductRecord['productSpec']): Record<keyof ProductSpec, string> {
  const spec = safeProductSpec(raw)
  return Object.fromEntries(Object.entries(spec).map(([key, value]) => [key, value === null ? '' : String(value)])) as Record<keyof ProductSpec, string>
}
const blank: Editor = { mode: 'create', companyCode: '', name: '', sku: '', unit: 'Thùng', category: '', spec: { ...specBlank } }
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
  const [editorTab, setEditorTab] = useState<'basic' | 'package' | 'spec' | 'prices'>('basic')
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
      spec: specForm(product.productSpec),
    }
    editorBaseline.current = original
    setEditor({ ...original })
    setEditorTab('basic')
    setError('');setMessage('')
  }

  function startCreate() {
    editorBaseline.current = { ...blank, spec: { ...specBlank } }
    setEditor({ ...blank, spec: { ...specBlank } })
    setEditorTab('basic')
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
      if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && document.activeElement === first) {
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

  function patchSpec(field: keyof ProductSpec, value: string) {
    setEditor(old => old ? { ...old, spec: { ...old.spec, [field]: value } } : null)
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editor || !isAdmin) return
    setError('');setMessage('')
    if (!isOnline) { setError('Cần có mạng để ghi danh mục STORE'); return }
    if (!snapshot.version) { setError('Cần đồng bộ danh mục mới nhất trước khi lưu'); return }
    if (!editor.companyCode.trim() || !editor.name.trim()) {
      setEditorTab('basic')
      setError('Mã CTY và tên hàng là hai trường bắt buộc')
      return
    }
    let productSpec: ProductSpec
    try { productSpec = normalizeProductSpec(editor.spec) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Quy cách không hợp lệ'); return }
    const previousUnit = editorBaseline.current?.unit.trim().toLocaleLowerCase('vi') ?? ''
    const updatedUnit = editor.unit.trim().toLocaleLowerCase('vi')
    const existing = snapshot.products.find(p => p.companyCode === editor.companyCode)
    if (editor.mode === 'update' && existing?.quantity !== null && existing?.quantity !== undefined && previousUnit !== updatedUnit &&
      !window.confirm('Mã này đang có số tồn. Đổi ĐVT KHÔNG tự đổi số lượng trong Excel. Anh đã kiểm tra đúng ĐVT tồn trước khi lưu?')) return
    setSaving(true)
    try {
      const jwt = await getAdminToken()
      const response = await fetch(new URL('admin/catalog/products', apiBase), {
        method: editor.mode === 'create' ? 'POST' : 'PATCH',
        headers: { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyCode: editor.companyCode, name: editor.name,
          sku: editor.sku || null, unit: editor.unit || null,
          category: editor.category || null, productSpec, expectedVersion: snapshot.version,
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
      setMessage('Đã lưu sản phẩm.')
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được sản phẩm')
    } finally {
      setSaving(false)
    }
  }

  const defaultType = snapshot.priceTypes.find(t => t.id === snapshot.defaultPriceTypeId)
  const editingProduct = editor?.mode === 'update' ? snapshot.products.find(p => p.companyCode === editor.companyCode) : null
  return (
    <section className="catalog-page" aria-label="Danh mục sản phẩm STORE">
      <div className="catalog-titlebar">
        <h1>Danh mục</h1>
        <div className="catalog-title-actions">
          {isAdmin && <button type="button" className="catalog-primary" onClick={startCreate}>+ Tạo sản phẩm</button>}
          <button type="button" className="catalog-secondary" onClick={onClose}>Về tra cứu</button>
        </div>
      </div>

      <div className="catalog-stats">
        <div><strong>{snapshot.products.length.toLocaleString('vi-VN')}</strong><span>Tổng mã CTY</span></div>
        <div className={unnamed ? 'needs-name' : ''}><strong>{unnamed.toLocaleString('vi-VN')}</strong><span>Thiếu tên</span></div>
      </div>

      {isAdmin && editor && (
        <div className="catalog-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closeEditor() }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="catalog-dialog-title" className="catalog-dialog">
        <form className="catalog-form catalog-dialog-form" onSubmit={event => { void submit(event) }}>
          <div className="catalog-form-heading">
            <div><h2 id="catalog-dialog-title">{editor.mode === 'create' ? 'Tạo sản phẩm mới' : 'Hoàn thiện / sửa sản phẩm'}</h2></div>
            <button type="button" className="catalog-secondary" onClick={closeEditor} disabled={saving} aria-label="Đóng cửa sổ chỉnh sửa">Đóng</button>
          </div>

          <div className="catalog-editor-tabs" role="group" aria-label="Các mục chỉnh sửa">
            <button type="button" className={editorTab === 'basic' ? 'active' : ''} aria-pressed={editorTab === 'basic'} onClick={() => setEditorTab('basic')}>Cơ bản</button>
            <button type="button" className={editorTab === 'package' ? 'active' : ''} aria-pressed={editorTab === 'package'} onClick={() => setEditorTab('package')}>Đóng gói</button>
            <button type="button" className={editorTab === 'spec' ? 'active' : ''} aria-pressed={editorTab === 'spec'} onClick={() => setEditorTab('spec')}>Thông số</button>
            {editor.mode === 'update' && <button type="button" className={editorTab === 'prices' ? 'active' : ''} aria-pressed={editorTab === 'prices'} onClick={() => setEditorTab('prices')}>Giá & tồn</button>}
          </div>
          {editorTab === 'basic' && <section className="catalog-editor-panel" aria-label="Thông tin cơ bản">
            <div className="catalog-form-grid">
              <label><span>Mã CTY <b>*</b></span><input type="text" required maxLength={120} value={editor.companyCode}
                onChange={e => patch({ companyCode: e.target.value })} disabled={editor.mode === 'update' || saving}
                autoComplete="off" spellCheck={false} placeholder="Mã trên Excel" /></label>
              <label><span>Tên hàng <b>*</b></span><input type="text" required maxLength={400} value={editor.name}
                onChange={e => patch({ name: e.target.value })} disabled={saving} autoComplete="off" placeholder="Tên theo danh mục công ty" /></label>
              <label><span>SKU</span><input maxLength={120} value={editor.sku} onChange={e => patch({ sku: e.target.value })} disabled={saving} placeholder="Nếu có" /></label>
              <label><span>Đơn vị tính</span><input list="store-units" maxLength={60} value={editor.unit} onChange={e => patch({ unit: e.target.value })} disabled={saving} placeholder="Thùng, hộp, quyển..." /><datalist id="store-units"><option value="Thùng" /><option value="Hộp" /><option value="Lốc" /><option value="Quyển" /><option value="Cái" /><option value="Bộ" /><option value="Gói" /></datalist></label>
              <label className="catalog-category-field"><span>Nhóm hàng</span><input maxLength={120} value={editor.category} onChange={e => patch({ category: e.target.value })} disabled={saving} placeholder="Nếu có" /></label>
            </div>
          </section>}
          {editorTab === 'package' && <section className="catalog-editor-panel catalog-spec-section" aria-label="Quy cách đóng gói">
            <p className="catalog-editor-guidance">Chỉ nhập quy cách đã xác minh.</p>
            <div className="catalog-form-grid">
              <label><span>Đơn vị sản phẩm lẻ</span><input maxLength={40} value={editor.spec.pieceUnit} onChange={e => patchSpec('pieceUnit', e.target.value)} disabled={saving} placeholder="Quyển, cái..." /></label>
              <label><span>Số sản phẩm / thùng</span><input type="number" min="1" max="100000000" step="1" value={editor.spec.unitsPerCarton} onChange={e => patchSpec('unitsPerCarton', e.target.value)} disabled={saving} placeholder="Nếu đã xác minh" /></label>
              <label><span>Đơn vị đóng gói</span><input maxLength={40} value={editor.spec.packUnit} onChange={e => patchSpec('packUnit', e.target.value)} disabled={saving} placeholder="Lốc, hộp..." /></label>
              <label><span>Số sản phẩm / lốc hoặc hộp</span><input type="number" min="1" max="100000" step="1" value={editor.spec.unitsPerPack} onChange={e => patchSpec('unitsPerPack', e.target.value)} disabled={saving} /></label>
              <label><span>Số lốc hoặc hộp / thùng</span><input type="number" min="1" max="100000" step="1" value={editor.spec.packsPerCarton} onChange={e => patchSpec('packsPerCarton', e.target.value)} disabled={saving} /></label>
              <label><span>Ghi chú đóng gói</span><input maxLength={300} value={editor.spec.packagingNote} onChange={e => patchSpec('packagingNote', e.target.value)} disabled={saving} /></label>
            </div>
          </section>}
          {editorTab === 'spec' && <section className="catalog-editor-panel catalog-spec-section" aria-label="Thông số sản phẩm">
            <div className="catalog-form-grid">
              <label><span>Khổ giấy</span><input maxLength={60} value={editor.spec.paperSize} onChange={e => patchSpec('paperSize', e.target.value)} disabled={saving} placeholder="A4, A5, B5..." /></label>
              <label><span>Số trang</span><input type="number" min="1" max="10000" step="1" value={editor.spec.pages} onChange={e => patchSpec('pages', e.target.value)} disabled={saving} /></label>
              <label><span>Định lượng GSM</span><input type="number" min="1" max="2000" step="1" value={editor.spec.gsm} onChange={e => patchSpec('gsm', e.target.value)} disabled={saving} /></label>
              <label><span>Loại kẻ</span><input maxLength={120} value={editor.spec.ruling} onChange={e => patchSpec('ruling', e.target.value)} disabled={saving} placeholder="4 ô, kẻ ngang..." /></label>
              <label className="catalog-category-field"><span>Loại bìa</span><input maxLength={120} value={editor.spec.coverType} onChange={e => patchSpec('coverType', e.target.value)} disabled={saving} /></label>
            </div>
          </section>}
          {editorTab === 'prices' && editor.mode === 'update' && <section className="catalog-editor-panel catalog-price-overview" aria-label="Giá và tồn kho">
            <div className="catalog-price-stock">
              <div><small>Tồn theo Excel</small><strong>{editingProduct?.quantity == null ? 'Chưa có dữ liệu' : editingProduct.quantity.toLocaleString('vi-VN') + ' ' + (editingProduct.unit || '')}</strong></div>
              <div><small>Nhập tồn</small><strong>{formatDate(editingProduct?.inventoryUpdatedAt ?? null)}</strong></div>
            </div>
            <div className="catalog-price-lines">
              {snapshot.priceTypes.length ? snapshot.priceTypes.map(type => <div key={type.id}><span>{type.label}{type.id === snapshot.defaultPriceTypeId ? ' · mặc định' : ''}</span><strong>{editingProduct ? formatVnd(priceFor(editingProduct, type.id)) : 'Chưa có giá'}</strong></div>) : <p>Chưa có bảng giá.</p>}
            </div>
            <p className="catalog-editor-guidance">Giá và tồn kho được cập nhật riêng trong mục Nhập Excel.</p>
          </section>}
          {editorTab === 'basic' && <p className="catalog-form-note">Đổi đơn vị tính không tự quy đổi số tồn.</p>}
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
          <span className="catalog-list-count">{filtered.length.toLocaleString('vi-VN')} sản phẩm</span>
          <button type="button" className="catalog-secondary" onClick={onSaved} disabled={isLoading || !isOnline}>Làm mới</button>
        </div>
        <div className="catalog-toolbar">
          <input type="search" aria-label="Tìm trong danh mục" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Tìm mã CTY / tên hàng / SKU..." autoComplete="off" />
          <label><input type="checkbox" checked={onlyUnnamed} onChange={e => setOnlyUnnamed(e.target.checked)} /> Chỉ xem mã thiếu tên</label>
        </div>
        {!filtered.length
          ? <div className="catalog-empty">{snapshot.products.length === 0 ? 'Chưa có sản phẩm.' : 'Không tìm thấy sản phẩm phù hợp.'}</div>
          : <div className="catalog-items">
            {filtered.slice(0, visible).map(item => {
              const currentState = stockState(item.quantity)
              return <article className="catalog-item" key={item.companyCode}>
                <div className="catalog-item-body">
                  <span className="catalog-code">{item.companyCode}</span>
                  <h3>{item.name?.trim() || <span className="catalog-unnamed">Chưa có tên hàng</span>}</h3>
                  <p>{[item.sku ? 'SKU: ' + item.sku : null, item.unit ? 'ĐVT: ' + item.unit : 'ĐVT: chưa xác nhận', item.category].filter(Boolean).join(' · ')}</p>
                  {piecesPerCarton(safeProductSpec(item.productSpec)) && safeProductSpec(item.productSpec).pieceUnit && <p className="catalog-pack-note">1 thùng = {piecesPerCarton(safeProductSpec(item.productSpec))?.toLocaleString('vi-VN')} {safeProductSpec(item.productSpec).pieceUnit}</p>}
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
        <h2>Lịch sử chỉnh sửa</h2>
        {historyError && <p className="catalog-hint">{historyError}</p>}
        {edits.length ? edits.slice(0, 8).map(entry => (
          <div className="catalog-audit-item" key={entry.id}>
            <span>{entry.action === 'create' ? 'Tạo' : 'Sửa'} <strong>{entry.company_code}</strong> · {entry.after_data?.name || 'Chưa có tên'}</span>
            <small>{new Date(entry.created_at).toLocaleString('vi-VN')}</small>
          </div>
        )) : <p className="catalog-hint">Chưa có lịch sử chỉnh sửa.</p>}
      </section>}
    </section>
  )
}
