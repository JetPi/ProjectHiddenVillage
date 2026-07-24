import type { HTMLAttributes, PropsWithChildren } from 'react'

type FormFieldProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

export function FormField({ className = '', children, ...fieldProps }: FormFieldProps) {
  return (
    <div
      {...fieldProps}
      className={`space-y-2 ${className}`.trim()}
    >
      {children}
    </div>
  )
}
