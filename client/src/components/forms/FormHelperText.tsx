import type { IFormHelperTextProps } from '@/components/forms/types'

export function FormHelperText({ className = '', children, ...helperProps }: IFormHelperTextProps) {
  return (
    <p
      {...helperProps}
      className={`text-xs text-[var(--text-muted)] ${className}`.trim()}
    >
      {children}
    </p>
  )
}
