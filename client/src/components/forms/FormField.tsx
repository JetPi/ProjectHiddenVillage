import { twMerge } from 'tailwind-merge'
import type { IFormFieldProps } from '@/components/forms/types'

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
