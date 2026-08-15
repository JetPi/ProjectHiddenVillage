import { twMerge } from 'tailwind-merge'
import type { IFormLabelProps } from '@/components/forms/types'

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
