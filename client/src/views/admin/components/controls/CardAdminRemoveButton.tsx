import { twMerge } from 'tailwind-merge'
import type { ICardAdminRemoveButtonProps } from '@/views/admin/types/cardAdminRemoveButton'

const variantClassNameMap = {
  inline: 'px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
  chip: 'rounded-full px-1 leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
} as const

export function CardAdminRemoveButton({
  ariaLabel,
  variant = 'inline',
  className,
  children = 'X',
  type = 'button',
  ...buttonProps
}: ICardAdminRemoveButtonProps) {
  return (
    <button
      type={type}
      className={twMerge(variantClassNameMap[variant], className)}
      aria-label={ariaLabel}
      {...buttonProps}
    >
      {children}
    </button>
  )
}
