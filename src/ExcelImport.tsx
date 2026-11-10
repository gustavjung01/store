import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { buildMappedImport, columnHeader } from './excelImportMapping'
import type { ColumnSelection, ExcelSheet } from './excelImportMapping'
import type { ImportKind, ImportIssue } from '../server/importValidation'
import type { ProductSpec } from './productSpec'

type ApiPreview = {
  valid: boolean
  batchId: string | null
  errors: ImportIssue[]
  summary?: {
    total: number
    newCount: number
    changedCount: number
    unchangedCount: number
    missingUnitCount?: number
    changedUnitWithStock?: number
    absentCodesUnaffected: number
    sample: Array<{
      rowNumber: number
      companyCode: string
      action: string
      previousQuantity: number | null
      nextQuantity: number | null
      previousPrices: Record<string, string>
      nextPrices: Record<string, number>
      previousUnit?: string | null
      nextUnit?: string | null
      previousCarton?: number | null
      nextCarton?: number | null
    }>
  }
}
type Batch = {
  id: string
  kind: ImportKind
  status: string
  filename: string
  created_at: string
  row_count: number
}

function batchStatusLabel(status: string): string {
  switch (status) {
    case 'applied': return 'Đã nhập'
    case 'undone': return 'Đã hoàn tác'
    case 'rolled_back': return 'Đã hoàn tác'
    case 'failed': return 'Thất bại'
    case 'pending': return 'Chờ xác nhận'
    default: return 'Đang xử lý'
  }
}

function displayPrices(prices: Record<string, string | number>): string {
  const entries = Object.entries(prices)
  return entries.length ? entries.map(([label, amount]) => label + ': ' + amount).join(' · ') : '—'
}

const initialMapping: ColumnSelection = {
  code:-1,quantity:-1,name:-1,sku:-1,unit:-1,specColumns:{},defaultUnitForNew:'Thùng',prices:[],defaultPriceColumn:-1,
}
const emptyOption = { label: '— Không chọn —', value: -1 }
const specColumnFields: Array<{ field: keyof ProductSpec; label: string }> = [
  { field: 'pieceUnit', label: 'ĐVT sản phẩm lẻ (quyển/cái)' },
  { field: 'unitsPerCarton', label: 'Số sản phẩm / thùng' },
  { field: 'packUnit', label: 'Đơn vị đóng gói (lốc/hộp)' },
  { field: 'unitsPerPack', label: 'Số sản phẩm / lốc-hộp' },
  { field: 'packsPerCarton', label: 'Số lốc-hộp / thùng' },
  { field: 'paperSize', label: 'Khổ giấy' },
  { field: 'pages', label: 'Số trang' },
  { field: 'gsm', label: 'GSM' },
  { field: 'ruling', label: 'Loại kẻ' },
  { field: 'coverType', label: 'Loại bìa' },
  { field: 'packagingNote', label: 'Ghi chú đóng gói' },
]

export default function ExcelImport({
  apiBase,getToken,onClose,onSaved,
}: {
  apiBase: string
  getToken: () => Promise<string>
  onClose: () => void
  onSaved: () => void
}) {
  const [kind,setKind] = useState<ImportKind>('inventory')
  const [filename,setFilename] = useState('')
  const [sheets,setSheets] = useState<ExcelSheet[]>([])
  const [sheetIndex,setSheetIndex] = useState(0)
  const [headerRow,setHeaderRow] = useState(1)
  const [mapping,setMapping] = useState<ColumnSelection>(initialMapping)
  const [preview,setPreview] = useState<ApiPreview | null>(null)
  const [issues,setIssues] = useState<ImportIssue[]>([])
  const [batches,setBatches] = useState<Batch[]>([])
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')

  const latestAppliedId = batches.find(batch => batch.status === 'applied')?.id
  const sheet = sheets[sheetIndex]
  const headers = useMemo(() => {
    if (!sheet) return []
    const count = Math.max(0, ...sheet.data.slice(0,Math.max(1,headerRow)).map(r => r.length))
    return Array.from({length: count},(_,i) => ({
      value:i,label:columnHeader(sheet.data,headerRow,i),
    }))
  },[sheet,headerRow])

  const request = useCallback(async (path:string, body?:object) => {
    const jwt = await getToken()
    const base = new URL(apiBase.endsWith('/') ? apiBase : apiBase + '/')
    const response = await fetch(new URL(path,base), {
      method:body ? 'POST':'GET',
      headers:{ Authorization:'Bearer ' + jwt, ...(body ? {'Content-Type':'application/json'}:{}) },
      body:body ? JSON.stringify(body) : undefined,
      cache:'no-store',
    })
    const data:unknown = await response.json()
    if (!response.ok && !(response.status === 422 && path === 'admin/import/preview')) {
      const reason = data && typeof data === 'object' && 'error' in data ? String((data as {error?:unknown}).error) : 'Yêu cầu thất bại'
      throw new Error(reason)
    }
    return data
  },[apiBase,getToken])

  const loadHistory = useCallback(async () => {
    const value = await request('admin/imports') as {batches?:Batch[]}
    setBatches(Array.isArray(value.batches) ? value.batches : [])
  },[request])

  useEffect(() => { void loadHistory().catch(() => {}) },[loadHistory])

  function changeMapping(patch:Partial<ColumnSelection>) {
    setMapping(current => ({...current,...patch}))
    setPreview(null);setIssues([]);setMessage('')
  }

  function changeSpecColumn(field: keyof ProductSpec, col: number) {
    changeMapping({ specColumns: { ...(mapping.specColumns ?? {}), [field]: col } })
  }

  function resetForNewFile() {
    setMapping(initialMapping);setPreview(null);setIssues([]);setError('');setMessage('')
  }

  async function chooseFile(e:ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    resetForNewFile()
    setSheets([]);setFilename('');setSheetIndex(0);setHeaderRow(1)
    if (!selected) return
    if (!/\.xlsx$/i.test(selected.name) || selected.size > 2 * 1024 * 1024) {
      setError('Chỉ chọn file .xlsx tối đa 2 MB mỗi lượt nhập')
      return
    }
    setBusy(true)
    try {
      const { default: readExcelFile } = await import('read-excel-file/browser')
      const parsed = await readExcelFile(selected)
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('File Excel không có sheet hợp lệ')
      setSheets(parsed as ExcelSheet[])
      setFilename(selected.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không đọc được file .xlsx')
    } finally {
      setBusy(false)
    }
  }

  async function previewImport() {
    setError('');setMessage('');setPreview(null);setIssues([])
    if (!sheet) { setError('Chọn file Excel trước'); return }
    const built = buildMappedImport(sheet,headerRow,mapping,kind,filename)
    if (!built.payload) {setIssues(built.issues);return}
    setBusy(true)
    try {
      const value = await request('admin/import/preview',built.payload) as ApiPreview
      if (!value.valid) {setIssues(value.errors ?? []);return}
      setPreview(value)
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Xem trước thất bại')}
    finally {setBusy(false)}
  }

  async function commit() {
    if (!preview?.valid || !preview.batchId) return
    if (kind === 'catalog' && (preview.summary?.changedUnitWithStock ?? 0) > 0 &&
      !window.confirm('Có mã hàng đang có tồn mà ĐVT thay đổi. Số tồn sẽ KHÔNG được quy đổi. Anh đã đối chiếu Excel và xác nhận ĐVT đúng cho tất cả các mã?')) return
    if (!window.confirm('Xác nhận ghi dữ liệu từ file Excel này vào STORE?')) return
    setBusy(true);setError('');setMessage('')
    try {
      const result = await request('admin/import/commit',{batchId:preview.batchId}) as {success?:boolean,count?:number}
      if (!result.success) throw new Error('Chưa xác nhận được lượt nhập')
      setMessage('Đã nhập ' + result.count + ' dòng.')
      setPreview(null)
      await loadHistory()
      onSaved()
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Không thể xác nhận lượt nhập')}
    finally {setBusy(false)}
  }

  async function rollback(id:string) {
    if (!window.confirm('Hoàn tác LƯỢT NHẬP GẦN NHẤT? Giá và tồn có thể được khôi phục về trước lần nhập.')) return
    setBusy(true);setError('');setMessage('')
    try {
      const result = await request('admin/import/rollback',{batchId:id}) as {success?:boolean,revertedRows?:number}
      if (!result.success) throw new Error('Chưa hoàn tác được')
      setMessage('Đã hoàn tác ' + result.revertedRows + ' dòng.')
      setPreview(null)
      await loadHistory()
      onSaved()
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Không thể hoàn tác')}
    finally {setBusy(false)}
  }

  function changeKind(value:ImportKind) {
    setKind(value);resetForNewFile()
  }

  const selectInput = (label:string,selected:number,onSelect:(n:number)=>void,required=false) => (
    <label className="excel-field" key={label}>
      <span>{label}</span>
      <select value={selected} onChange={e=>onSelect(Number(e.target.value))}>
        {!required && <option value={-1}>{emptyOption.label}</option>}
        {required && <option value={-1}>— Chọn cột —</option>}
        {headers.map(h=><option key={h.value} value={h.value}>{h.label} (cột {h.value+1})</option>)}
      </select>
    </label>
  )

  return (
    <section className="excel-page" aria-label="Nhập Excel STORE">
      <div className="excel-heading"><h2>Nhập Excel</h2><button onClick={onClose} type="button">Về tra cứu</button></div>
      <div className="excel-card">
        <div className="excel-kinds">
          <button className={kind === 'inventory' ? 'active' : ''} type="button" onClick={()=>changeKind('inventory')}>Nhập tồn kho</button>
          <button className={kind === 'catalog' ? 'active' : ''} type="button" onClick={()=>changeKind('catalog')}>Danh mục & bảng giá</button>
        </div>
        <label className="excel-file"><span>Chọn file .xlsx (tối đa 2 MB)</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{void chooseFile(e)}} /></label>
        {sheet && <>
          <div className="excel-grid">
            <label className="excel-field"><span>Trang tính</span><select value={sheetIndex} onChange={e=>{setSheetIndex(Number(e.target.value));setHeaderRow(1);resetForNewFile()}}>{sheets.map((s,i)=><option key={s.sheet} value={i}>{s.sheet}</option>)}</select></label>
            <label className="excel-field"><span>Dòng tiêu đề</span><select value={headerRow} onChange={e=>{setHeaderRow(Number(e.target.value));resetForNewFile()}}>{Array.from({length:Math.min(20,Math.max(0,sheet.data.length-1))},(_,i)=><option value={i+1} key={i+1}>Dòng {i+1}</option>)}</select></label>
          </div>
          <div className="excel-grid">
            {selectInput('Mã CTY *',mapping.code,n=>changeMapping({code:n}),true)}
            {kind === 'inventory' && selectInput('Số tồn *',mapping.quantity,n=>changeMapping({quantity:n}),true)}
            {kind === 'catalog' && <>
              {selectInput('Tên hàng · cần cho mã mới',mapping.name,n=>changeMapping({name:n}))}
              {selectInput('SKU',mapping.sku,n=>changeMapping({sku:n}))}
              {selectInput('Đơn vị tính',mapping.unit,n=>changeMapping({unit:n}))}
            </>}
          </div>
          {kind === 'catalog' && <>
            <div className="excel-pack-fields">
              <label className="excel-field"><span>ĐVT mặc định chỉ cho MÃ MỚI chưa có cột ĐVT</span>
                <select value={mapping.defaultUnitForNew ?? ''} onChange={e=>changeMapping({defaultUnitForNew:e.target.value || null})}>
                  <option value="">Không tự gán · cần xác nhận sau</option>
                  <option value="Thùng">Thùng (bán sỉ)</option>
                  <option value="Hộp">Hộp</option>
                  <option value="Lốc">Lốc</option>
                  <option value="Quyển">Quyển</option>
                  <option value="Cái">Cái</option>
                  <option value="Bộ">Bộ</option>
                </select>
              </label>
              <details><summary>Ánh xạ các cột quy cách (tùy chọn)</summary>
                <p>Chỉ những cột được chọn và có giá trị mới cập nhật quy cách. Không đoán số sản phẩm/thùng; quy cách mâu thuẫn bị chặn khi xem trước.</p>
                <div className="excel-grid">
                  {specColumnFields.map(({field,label})=>selectInput(label,mapping.specColumns?.[field] ?? -1,n=>changeSpecColumn(field,n)))}
                </div>
              </details>
            </div>
            <div className="excel-price-fields"><strong>Chọn các cột giá trong Excel</strong><p>Ô giá trống không xóa giá cũ. Giá 0 là giá trị hợp lệ.</p>
              <div className="excel-checks">
                {headers.map(h=><label key={h.value}><input type="checkbox" checked={mapping.prices.includes(h.value)} onChange={e=>{
                  const prices = e.target.checked ? [...mapping.prices,h.value] : mapping.prices.filter(i=>i!==h.value)
                  changeMapping({prices,defaultPriceColumn:prices.includes(mapping.defaultPriceColumn) ? mapping.defaultPriceColumn : -1})
                }} />{h.label}</label>)}
              </div>
            </div>
            <label className="excel-field"><span>Loại giá hiển thị mặc định cho nhân viên</span><select value={mapping.defaultPriceColumn} onChange={e=>changeMapping({defaultPriceColumn:Number(e.target.value)})}><option value={-1}>Giữ mặc định hiện tại</option>{headers.filter(h=>mapping.prices.includes(h.value)).map(h=><option key={h.value} value={h.value}>{h.label}</option>)}</select></label>
          </>}
          <details className="excel-guidance"><summary>Lưu ý khi nhập</summary><p>Mã CTY phải là dạng văn bản để giữ số 0 đầu. Số tồn theo đơn vị tính của từng mã; mã mới chưa rõ đơn vị tính không tự coi là thùng. Đơn vị tính mặc định chỉ áp dụng cho mã mới. Mã không có trong file sẽ giữ nguyên số tồn.</p></details>
          <button className="excel-primary" type="button" disabled={busy} onClick={()=>{void previewImport()}}>{busy ? 'Đang xử lý...' : 'Xem trước thay đổi'}</button>
        </>}
        {issues.length > 0 && <div className="excel-issues" role="alert"><strong>Chưa thể xác nhận: {issues.length} lỗi được phát hiện</strong>{issues.slice(0,30).map((i,index)=><p key={index}>Dòng {i.rowNumber || 'cấu hình'}: {i.message}</p>)}</div>}
        {error && <div className="excel-issues" role="alert">{error}</div>}
        {message && <div className="excel-success" role="status">{message}</div>}
      </div>
      {preview?.valid && preview.summary && <div className="excel-card">
        <h3>Kiểm tra trước khi ghi</h3>
        <div className="excel-stats">
          <span><strong>{preview.summary.total}</strong>Dòng hợp lệ</span>
          <span><strong>{preview.summary.newCount}</strong>Mã mới</span>
          <span><strong>{preview.summary.changedCount}</strong>Thay đổi</span>
          <span><strong>{preview.summary.unchangedCount}</strong>Không đổi</span>
        </div>
        <p className="excel-notice">{preview.summary.absentCodesUnaffected} mã trong STORE không có trong file sẽ được giữ nguyên. Bản xem trước hết hạn sau 20 phút.</p>
        {(preview.summary.missingUnitCount ?? 0) > 0 && <p className="excel-unit-warning" role="status">{preview.summary.missingUnitCount} mã trong lượt nhập chưa xác nhận ĐVT. Không tự hiểu số tồn là thùng.</p>}
        {(preview.summary.changedUnitWithStock ?? 0) > 0 && <p className="excel-unit-warning" role="alert">Cảnh báo: {preview.summary.changedUnitWithStock} mã đang có số tồn sẽ bị đổi ĐVT mà KHÔNG quy đổi số lượng. Cần đối chiếu trước khi xác nhận.</p>}
        <div className="excel-table-wrap"><table><thead><tr><th>Dòng</th><th>Mã CTY</th><th>Trạng thái</th><th>ĐVT trước → sau</th><th>SP/thùng trước → sau</th><th>Trước</th><th>Sau</th></tr></thead><tbody>
          {preview.summary.sample.map(row=><tr key={row.rowNumber}><td>{row.rowNumber}</td><td><code>{row.companyCode}</code></td><td>{row.action==='new'?'Mã mới':row.action==='changed'?'Thay đổi':'Giữ nguyên'}</td><td>{row.previousUnit || '—'} → {row.nextUnit || 'Chưa xác nhận'}</td><td>{row.previousCarton ?? '—'} → {row.nextCarton ?? '—'}</td><td>{kind==='inventory' ? row.previousQuantity ?? 'Chưa có' : displayPrices(row.previousPrices)}</td><td>{kind==='inventory' ? row.nextQuantity ?? 'Chưa có' : displayPrices(row.nextPrices)}</td></tr>)}
        </tbody></table></div>
        <p className="excel-notice">Hiển thị tối đa 80 dòng; toàn bộ {preview.summary.total} dòng sẽ được kiểm tra trước khi nhập.</p>
        <button type="button" className="excel-primary" disabled={busy} onClick={()=>{void commit()}}>XÁC NHẬN CẬP NHẬT STORE</button>
      </div>}
      <div className="excel-card">
        <h3>Lịch sử nhập gần đây</h3><p className="excel-notice">Chỉ được hoàn tác lượt nhập mới nhất, để tránh làm sai các thay đổi về sau.</p>
        {batches.length===0?<p>Chưa có lượt nhập nào.</p>:<div className="excel-history">
          {batches.map(batch=><div key={batch.id}><div><strong>{batch.filename}</strong><small>{batch.kind==='inventory'?'Tồn':'Danh mục/giá'} · {batch.row_count} dòng · {batchStatusLabel(batch.status)} · {new Date(batch.created_at).toLocaleString('vi-VN')}</small></div>{batch.id === latestAppliedId && <button disabled={busy} type="button" onClick={()=>{void rollback(batch.id)}}>Hoàn tác</button>}</div>)}
        </div>}
      </div>
    </section>
  )
}
