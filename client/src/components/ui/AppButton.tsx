import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type AppButtonProps = PropsWithChildren<{
  variant?: 'primary' | 'ghost'
}> &
  ButtonHTMLAttributes<HTMLButtonElement>

export function AppButton({
  variant = 'primary',
  className = '',
  children,
  ...buttonProps
}: AppButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'bg-[var(--button-primary-bg)] text-[var(--button-primary-text)] hover:bg-[var(--button-primary-hover)]'
      : 'bg-transparent text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'

  return (
    <button
      {...buttonProps}
      className={`inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold transition-colors duration-200 ${variantClass} ${className}`.trim()}
    >
      {children}
    </button>
  )
}
