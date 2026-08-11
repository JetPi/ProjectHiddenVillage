import { forwardRef } from 'react'
import type { IFormTextareaProps } from './types'

export const FormTextarea = forwardRef<HTMLTextAreaElement, IFormTextareaProps>(function FormTextarea(
  { className = '', rows = 4, ...textareaProps },
  ref,
) {
  return (
    <textarea
      {...textareaProps}
      ref={ref}
      rows={rows}
      className={`w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--focus-ring)] focus:outline-none ${className}`.trim()}
    />
  )
})
