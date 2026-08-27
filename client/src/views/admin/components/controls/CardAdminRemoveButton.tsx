import { twMerge } from 'tailwind-merge'
import type { ICardAdminRemoveButtonProps } from '@/views/admin/types/cardAdminRemoveButton'

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
    ? <span aria-hidden="true" className="leading-none">X</span>
    : (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ))

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
