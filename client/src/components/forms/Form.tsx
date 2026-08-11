import { Form as RouterForm } from 'react-router-dom'
import { twMerge } from 'tailwind-merge'
import type { IFormProps } from './types'

export function Form({ className = '', children, ...formProps }: IFormProps) {
  return (
    <RouterForm
      {...formProps}
      className={twMerge('space-y-4', className)}
    >
      {children}
    </RouterForm>
  )
}
