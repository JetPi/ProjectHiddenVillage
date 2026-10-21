import { twMerge } from 'tailwind-merge'
import type { IAppButtonProps } from '@/components/ui/types'

export function AppButton({
  variant = 'primary',
  className = '',
  children,
  ...buttonProps
}: IAppButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] hover:bg-[var(--button-primary-hover)] disabled:hover:bg-[var(--button-primary-bg)]'
      : 'bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)] disabled:hover:bg-transparent'

  return (
    <button
      {...buttonProps}
      className={twMerge(
        'inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        variantClass,
        className,
      )}
    >
      {children}
    </button>
  )
}
