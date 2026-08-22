import type { ReactNode } from 'react'

export type ICountConstraintMode = 'Exact' | 'Minimum' | 'Maximum' | 'All'

export type ICountConstraintFieldProps = {
  mode: ICountConstraintMode
  value: number | null
  onModeChange: (mode: ICountConstraintMode) => void
  onValueChange: (value: number | null) => void
  modeLabel?: string
  valueLabel?: string
  min?: number
  step?: number
  inputMode?: 'numeric' | 'decimal'
  placeholder?: string
  className?: string
  selectClassName?: string
  inputClassName?: string
  trailingContent?: ReactNode
}
