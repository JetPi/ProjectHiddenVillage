import { twMerge } from 'tailwind-merge'
import type { IFormActionsProps } from '@/components/forms/types'

export function FormActions({ className = '', children, ...actionsProps }: IFormActionsProps) {
  return (
    <div
      {...actionsProps}
      className={twMerge('flex w-fit items-center gap-3 pt-2', className)}
    >
      {children}
    </div>
  )
}
