import { twMerge } from 'tailwind-merge'
import type { IFormFieldProps } from './types'

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
