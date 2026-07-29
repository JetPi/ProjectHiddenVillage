import type { FormHTMLAttributes, PropsWithChildren } from 'react'
import { twMerge } from 'tailwind-merge'

type FormProps = PropsWithChildren<FormHTMLAttributes<HTMLFormElement>>

export function Form({ className = '', children, ...formProps }: FormProps) {
  return (
    <form
      {...formProps}
      className={twMerge('space-y-4', className)}
    >
      {children}
    </form>
  )
}
