import { twMerge } from 'tailwind-merge'
import type { ICardAdminToggleSwitchProps } from '@/views/admin/types/cardAdminViewTypes'

export function CardAdminToggleSwitch({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
  className,
  trackClassName,
  thumbClassName,
  dataTestId,
}: ICardAdminToggleSwitchProps) {
  return (
    <label className={twMerge('relative inline-flex h-5 w-9 cursor-pointer items-center', className)}>
      <input
        type="checkbox"
        data-testid={dataTestId}
        aria-label={ariaLabel}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        // The input covers the switch rather than being visually hidden, so a click lands on the control itself.
        className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
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
    </label>
  )
}
