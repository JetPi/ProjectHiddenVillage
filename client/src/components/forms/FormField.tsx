import type { HTMLAttributes, PropsWithChildren } from 'react'
import { twMerge } from 'tailwind-merge'

type FormFieldProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

export function FormField({ className = '', children, ...fieldProps }: FormFieldProps) {
  return (
    <div
      {...fieldProps}
      className={twMerge('space-y-2', className)}
    >
      {children}
    </div>
  )
}
