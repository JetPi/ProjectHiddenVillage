import type { HTMLAttributes, PropsWithChildren } from 'react'
import { twMerge } from 'tailwind-merge'

type FormActionsProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

export function FormActions({ className = '', children, ...actionsProps }: FormActionsProps) {
  return (
    <div
      {...actionsProps}
      className={twMerge('flex w-fit items-center gap-3 pt-2', className)}
    >
      {children}
    </div>
  )
}
