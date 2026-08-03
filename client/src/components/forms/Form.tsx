import type { ComponentProps, PropsWithChildren } from 'react'
import { Form as RouterForm } from 'react-router-dom'
import { twMerge } from 'tailwind-merge'

type FormProps = PropsWithChildren<ComponentProps<typeof RouterForm>>

export function Form({ className = '', children, ...formProps }: FormProps) {
  return (
    <RouterForm
      {...formProps}
      className={twMerge('space-y-4', className)}
    >
      {children}
    </RouterForm>
  )
}
