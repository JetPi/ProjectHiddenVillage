import type { LabelHTMLAttributes, PropsWithChildren } from 'react'
import { twMerge } from 'tailwind-merge'

type IFormLabelProps = PropsWithChildren<LabelHTMLAttributes<HTMLLabelElement>>

export function FormLabel({ className = '', children, ...labelProps }: IFormLabelProps) {
  return (
    <label
      {...labelProps}
      className={twMerge(
        'block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)]',
        className,
      )}
    >
      {children}
    </label>
  )
}
