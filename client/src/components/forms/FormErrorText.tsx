import type { HTMLAttributes, PropsWithChildren } from 'react'

type FormErrorTextProps = PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>

export function FormErrorText({ className = '', children, ...errorProps }: FormErrorTextProps) {
  return (
    <p
      {...errorProps}
      role="alert"
      className={`text-xs font-medium text-[var(--button-primary-bg)] ${className}`.trim()}
    >
      {children}
    </p>
  )
}
