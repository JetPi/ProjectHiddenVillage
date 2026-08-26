import { twMerge } from 'tailwind-merge'
import type { ICardAdminSelectProps } from '@/views/admin/types/cardAdminSelect'

export function CardAdminSelect({
  className,
  children,
  ...props
}: ICardAdminSelectProps) {
  return (
    <select
      {...props}
      className={twMerge(
        'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]',
        className,
      )}
    >
      {children}
    </select>
  )
}
