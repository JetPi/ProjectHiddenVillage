import type { HTMLAttributes, PropsWithChildren } from 'react'
import { twMerge } from 'tailwind-merge'

type IFormFieldProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

export function FormField({ className = '', children, ...fieldProps }: IFormFieldProps) {
  return (
    <div
      {...fieldProps}
      className={twMerge('space-y-2', className)}
    >
      {children}
    </div>
  )
}
