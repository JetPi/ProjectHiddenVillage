import { forwardRef } from 'react'
import type { IFormCheckboxFieldProps, IFormCheckboxProps } from './types'

export const FormCheckbox = forwardRef<HTMLInputElement, IFormCheckboxProps>(function FormCheckbox(
  { className = '', ...checkboxProps },
  ref,
) {
  return (
    <input
      {...checkboxProps}
      ref={ref}
      type="checkbox"
      className={`h-4 w-4 rounded border border-[var(--border-subtle)] bg-[var(--field-bg)] accent-[var(--button-primary-bg)] focus:outline-none ${className}`.trim()}
    />
  )
})

export function FormCheckboxField({
  className = '',
  labelClassName = '',
  label,
  id,
  children,
  ...checkboxProps
}: IFormCheckboxFieldProps) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-2 text-sm text-[var(--text-secondary)] ${className}`.trim()}
    >
      <FormCheckbox id={id} {...checkboxProps} />
      <span className={labelClassName}>{label}</span>
      {children}
    </label>
  )
}
