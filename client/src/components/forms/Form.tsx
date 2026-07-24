import type { FormHTMLAttributes, PropsWithChildren } from 'react'

type FormProps = PropsWithChildren<FormHTMLAttributes<HTMLFormElement>>

export function Form({ className = '', children, ...formProps }: FormProps) {
  return (
    <form
      {...formProps}
      className={`space-y-4 ${className}`.trim()}
    >
      {children}
    </form>
  )
}
