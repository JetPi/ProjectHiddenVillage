import type { ReactNode } from 'react'

export type ICardAdminSelectOption = {
  value: string
  label: ReactNode
  disabled: boolean
}

/**
 * Props of the admin dropdown.
 *
 * The option list is declared as `<option>` children exactly like a native `<select>`, but the control is a
 * custom listbox (see `CardAdminSelect`), so the handler receives the chosen value directly instead of a
 * change event.
 */
export type ICardAdminSelectProps = {
  value: string
  onValueChange: (value: string) => void
  children?: ReactNode
  disabled?: boolean
  className?: string
  id?: string
  title?: string
  'aria-label'?: string
}
