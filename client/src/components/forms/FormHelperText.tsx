import type { HTMLAttributes, PropsWithChildren } from 'react'

type FormHelperTextProps = PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>

export function FormHelperText({ className = '', children, ...helperProps }: FormHelperTextProps) {
  return (
    <p
      {...helperProps}
      className={`text-xs text-[var(--text-muted)] ${className}`.trim()}
    >
      {children}
    </p>
  )
}
