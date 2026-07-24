import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

type FormInputProps = InputHTMLAttributes<HTMLInputElement>

export const FormInput = forwardRef<HTMLInputElement, FormInputProps>(function FormInput(
  { className = '', ...inputProps },
  ref,
) {
  return (
    <input
      {...inputProps}
      ref={ref}
      className={`w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:outline-none ${className}`.trim()}
    />
  )
})
