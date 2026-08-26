import { twMerge } from 'tailwind-merge'
import type { ICardAdminToggleSwitchProps } from '@/views/admin/types/cardAdminToggleSwitch'

export function CardAdminToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  className,
  trackClassName,
  thumbClassName,
}: ICardAdminToggleSwitchProps) {
  return (
    <span className={twMerge('relative inline-flex h-5 w-9 items-center', className)}>
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        className={twMerge(
          'absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-amber-500/70 peer-disabled:opacity-50',
          trackClassName,
        )}
      />
      <span
        className={twMerge(
          'absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4 peer-disabled:opacity-80',
          thumbClassName,
        )}
      />
    </span>
  )
}
