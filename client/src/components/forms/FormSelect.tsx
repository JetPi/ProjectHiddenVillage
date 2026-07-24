import { forwardRef } from 'react'
import type { SelectHTMLAttributes } from 'react'

type FormSelectProps = SelectHTMLAttributes<HTMLSelectElement>

export const FormSelect = forwardRef<HTMLSelectElement, FormSelectProps>(function FormSelect(
  { className = '', children, ...selectProps },
  ref,
) {
  return (
    <select
      {...selectProps}
      ref={ref}
      className={`w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-4 py-3 text-sm text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none ${className}`.trim()}
    >
      {children}
    </select>
  )
})
