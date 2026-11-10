import { useId, useState } from 'react'

/** Every suggested value is optional. Selecting a suggestion is the only way to apply it. */
const OTHER = '__store_other_value__'

export const commonAttributeChoices = {
  unit: ['Thùng', 'Hộp', 'Lốc', 'Quyển', 'Cái', 'Bộ', 'Gói'],
  pieceUnit: ['Quyển', 'Cái', 'Tờ', 'Bộ', 'Gói'],
  packUnit: ['Lốc', 'Hộp', 'Gói', 'Bó'],
  paperSize: ['A4', 'A5', 'B5', 'B6', 'A6'],
  pages: ['48', '80', '96', '120', '160', '200'],
  gsm: ['70', '80', '100', '120'],
  ruling: ['4 ô ly', '5 ô ly', 'Ô ly', 'Kẻ ngang', 'Kẻ chấm', 'Không kẻ'],
  coverType: ['Bìa mềm', 'Bìa cứng', 'Bìa nhựa'],
} as const

export interface AttributeDropdownProps {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
  disabled: boolean
  maxLength?: number
  numericMax?: number
  fullWidth?: boolean
}

export default function AttributeDropdown({
  label, value, options, onChange, disabled, maxLength = 120, numericMax, fullWidth = false,
}: AttributeDropdownProps) {
  const [custom, setCustom] = useState(false)
  const selectId = useId()
  // Add the current value as a choice so old/unusual product facts remain intact.
  const choices = Array.from(new Set([...options, value]
    .map(item => String(item).trim()).filter(item => Boolean(item) && item !== OTHER)))
  return (
    <div className={'catalog-attribute-field' + (fullWidth ? ' catalog-category-field' : '')}>
      <label htmlFor={selectId}>{label}</label>
      <select id={selectId}
        aria-label={'Chọn ' + label.toLocaleLowerCase('vi')}
        value={custom ? OTHER : value}
        disabled={disabled}
        onChange={event => {
          if (event.target.value === OTHER) {
            setCustom(true)
          } else {
            setCustom(false)
            onChange(event.target.value)
          }
        }}
      >
        <option value="">— Chưa có —</option>
        {choices.map(option => <option key={option} value={option}>{option}</option>)}
        <option value={OTHER}>Khác… (tự nhập)</option>
      </select>
      {custom && <input
        autoFocus
        type={numericMax === undefined ? 'text' : 'number'}
        inputMode={numericMax === undefined ? 'text' : 'numeric'}
        min={numericMax === undefined ? undefined : 1}
        max={numericMax}
        step={numericMax === undefined ? undefined : 1}
        maxLength={numericMax === undefined ? maxLength : undefined}
        aria-label={'Nhập giá trị khác cho ' + label}
        value={value}
        placeholder={numericMax === undefined ? 'Nhập thông tin đã xác nhận' : 'Nhập số nguyên đã xác nhận'}
        disabled={disabled}
        onChange={event => onChange(event.target.value)}
      />}
    </div>
  )
}
