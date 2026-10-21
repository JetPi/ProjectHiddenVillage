import { X } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import type { ICardAdminRemoveButtonProps } from '@/views/admin/types/cardAdminViewTypes'

const variantClassNameMap = {
  inline: 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
  chip: 'inline-flex items-center justify-center px-0.5 py-0 text-[11px] leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
} as const

export function CardAdminRemoveButton({
  ariaLabel,
  variant = 'inline',
  className,
  children,
  type = 'button',
  ...buttonProps
}: ICardAdminRemoveButtonProps) {
  const resolvedChildren = children ?? (variant === 'chip'
    ? <X size={12} strokeWidth={2.5} />
    : <X size={16} strokeWidth={2} />)

  return (
    <button
      type={type}
      className={twMerge(variantClassNameMap[variant], className)}
      aria-label={ariaLabel}
      {...buttonProps}
    >
      {resolvedChildren}
    </button>
  )
}
