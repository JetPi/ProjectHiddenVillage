import type { HTMLAttributes } from 'react'
import { twMerge } from 'tailwind-merge'

export type ToggleOption<T extends string> = {
  value: T
  label: string
  disabled?: boolean
}

type OptionToggleProps<T extends string> = {
  value: T
  options: readonly ToggleOption<T>[]
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
  optionClassName?: string
} &
  Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>

export function OptionToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
  optionClassName = '',
  ...groupProps
}: OptionToggleProps<T>) {
  return (
    <div
      {...groupProps}
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))` }}
      className={twMerge(
        'inline-grid w-full gap-1 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-1',
        className,
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={twMerge(
              'rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50',
              isActive
                ? 'bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]'
                : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
              optionClassName,
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
