import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type CardAdminRemoveButtonVariant = 'inline' | 'chip'

export interface ICardAdminRemoveButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  ariaLabel: string
  variant?: CardAdminRemoveButtonVariant
  children?: ReactNode
}
