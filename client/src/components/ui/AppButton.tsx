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
        // A disabled button has to look disabled: the attribute alone still paints the action colour and reads as
        // available. Callers that disable a button for a *busy* state can override these with `disabled:opacity-*`.
        'inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
        variantClass,
        className,
      )}
    >
      {children}
    </button>
  )
}
