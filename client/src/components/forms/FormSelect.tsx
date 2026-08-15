import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { twMerge } from 'tailwind-merge'
import type { IFormSelectProps } from '@/components/forms/types'

export function FormSelect({
  id,
  value,
  options,
  onValueChange,
  name,
  placeholder = 'Select an option',
  disabled = false,
  className = '',
}: IFormSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const selectedOption = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  )

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const handleSelect = (nextValue: string) => {
    onValueChange(nextValue)
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        role="combobox"
        aria-controls={`${id}-listbox`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((prev) => !prev)}
        className={twMerge(
          'w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--field-bg)] px-4 py-3 pr-12 text-left text-sm normal-case text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
      >
        <span
          className={
            selectedOption
              ? selectedOption.value
                ? 'font-semibold text-[var(--text-primary)]'
                : 'font-normal text-[var(--text-primary)]'
              : 'font-normal text-[var(--text-muted)]'
          }
        >
          {selectedOption?.label || placeholder}
        </span>
      </button>
      <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-[var(--text-muted)]">
        <ChevronDown size={16} aria-hidden="true" />
      </span>

      {isOpen ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--dropdown-bg)] p-1 text-sm shadow-[var(--panel-shadow)]"
        >
          {options.map((option) => {
            const isSelected = option.value === value

            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => handleSelect(option.value)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm normal-case transition-colors duration-150 ${
                    isSelected
                      ? 'bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]'
                      : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                  } ${option.value ? 'font-semibold' : 'font-normal'} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {option.label}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
