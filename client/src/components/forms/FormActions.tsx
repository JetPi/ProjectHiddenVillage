import type { HTMLAttributes, PropsWithChildren } from 'react'

type FormActionsProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

export function FormActions({ className = '', children, ...actionsProps }: FormActionsProps) {
  return (
    <div
      {...actionsProps}
      className={`flex w-fit items-center gap-3 pt-2 ${className}`.trim()}
    >
      {children}
    </div>
  )
}
