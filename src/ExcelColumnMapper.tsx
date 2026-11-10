import { useEffect, useMemo, useState } from 'react'
import type { ImportKind } from '../server/importValidation.ts'
import { columnHeader } from './excelImportMapping'
import type { ColumnSelection, ExcelCell, ExcelSheet } from './excelImportMapping'
import { catalogColumns, inventoryColumns, mapColumn, targetForColumn } from './excelColumnMapping'
import type { ColumnTarget } from './excelColumnMapping'

type Props = {
  sheet: ExcelSheet
  headerRow: number
  kind: ImportKind
  mapping: ColumnSelection
  disabled: boolean
  onChange: (mapping: ColumnSelection) => void
}

const PAGE_SIZE = 5
const SAMPLE_ROWS = 5

function previewText(value: ExcelCell): string {
  if (value === null || value === undefined || value === '') return '—'
  if (value instanceof Date) return value.toLocaleDateString('vi-VN')
  if (typeof value === 'boolean') return value ? 'Đúng' : 'Sai'
  return String(value)
}

function excelColumnName(index: number): string {
  let n = index + 1, name = ''
  while (n) { n--; name = String.fromCharCode(65 + n % 26) + name; n = Math.floor(n / 26) }
  return name
}

export default function ExcelColumnMapper({ sheet, headerRow, kind, mapping, disabled, onChange }: Props) {
  const [page, setPage] = useState(0)
  const columns = useMemo(() => {
    const scanned = sheet.data.slice(Math.max(0, headerRow-1), headerRow+SAMPLE_ROWS)
    const count = Math.max(0, ...scanned.map(row => row.length))
    return Array.from({ length: count }, (_, i) => i)
  }, [sheet, headerRow])
  const codeColumn = mapping.code >= 0 && columns.includes(mapping.code) ? mapping.code : -1
  const remaining = columns.filter(column => column !== codeColumn)
  const maxPage = Math.max(0, Math.ceil(remaining.length / PAGE_SIZE) - 1)
  const safePage = Math.min(page, maxPage)
  const selected = [...(codeColumn >= 0 ? [codeColumn] : []), ...remaining.slice(safePage*PAGE_SIZE, (safePage+1)*PAGE_SIZE)]
  const options = kind === 'catalog' ? catalogColumns : inventoryColumns
  const usedCount = columns.filter(column => targetForColumn(mapping, column, kind) !== 'skip').length
  const samples = sheet.data.slice(headerRow, headerRow + SAMPLE_ROWS)

  useEffect(() => { setPage(0) }, [sheet, headerRow, kind])

  return (
    <section className="excel-column-map" aria-label="Ghép cột Excel với thuộc tính">
      <div className="excel-column-map-heading">
        <div>
          <h3>Bước 2 · Chọn thuộc tính cho từng cột</h3>
          <p>Đề xuất theo tên cột. Anh có thể đổi lựa chọn hoặc bỏ qua cột không cần nhập.</p>
        </div>
        <span className="excel-mapped-count">{usedCount}/{columns.length} cột đã chọn</span>
      </div>
      <div className="excel-column-map-pager">
        <span>Đang xem {remaining.length === 0 ? 0 : safePage*PAGE_SIZE+1}–{Math.min(remaining.length,(safePage+1)*PAGE_SIZE)} / {remaining.length} cột {codeColumn >= 0 ? '· Mã CTY cố định bên trái' : ''}</span>
        <div>
          <button type="button" disabled={disabled || safePage===0} onClick={() => setPage(p => Math.max(0,p-1))}>‹ Trước</button>
          <button type="button" disabled={disabled || safePage>=maxPage} onClick={() => setPage(p => Math.min(maxPage,p+1))}>Tiếp ›</button>
        </div>
      </div>
      <div className="excel-column-map-scroll" tabIndex={0} aria-label="Bảng xem trước và chọn cột Excel">
        <table>
          <thead>
            <tr>{selected.map(column => {
              const header = columnHeader(sheet.data, headerRow, column)
              const target = targetForColumn(mapping,column,kind)
              return (
                <th key={column} scope="col">
                  <span className="excel-mapper-col-label">Cột {excelColumnName(column)} · {header}</span>
                  <select
                    aria-label={'Thuộc tính cho cột ' + excelColumnName(column) + ', ' + header}
                    value={target}
                    disabled={disabled}
                    onChange={e => onChange(mapColumn(mapping,column,e.target.value as ColumnTarget,kind))}
                  >
                    <option value="skip">— Bỏ qua —</option>
                    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </th>
              )
            })}</tr>
          </thead>
          <tbody>{samples.map((row, index) => (
            <tr key={index}>{selected.map(column => {
              const raw = previewText(row?.[column])
              return <td key={column} title={raw}>{raw}</td>
            })}</tr>
          ))}</tbody>
        </table>
      </div>
      <p className="excel-column-map-note">Chọn “Bỏ qua” để giữ nguyên trường đó. Giá không được tự chọn; chỉ ghép cột giá đã được duyệt. Chưa có thao tác ghi dữ liệu.</p>
    </section>
  )
}
