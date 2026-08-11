import type { IFormErrorTextProps } from './types'

export function FormErrorText({ className = '', children, ...errorProps }: IFormErrorTextProps) {
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
