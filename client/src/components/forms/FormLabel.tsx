import type { LabelHTMLAttributes, PropsWithChildren } from 'react'

type FormLabelProps = PropsWithChildren<LabelHTMLAttributes<HTMLLabelElement>>

export function FormLabel({ className = '', children, ...labelProps }: FormLabelProps) {
  return (
    <label
      {...labelProps}
      className={`block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)] ${className}`.trim()}
    >
      {children}
    </label>
  )
}
