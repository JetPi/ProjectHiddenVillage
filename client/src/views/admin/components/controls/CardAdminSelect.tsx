import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FocusEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import { CardAdminChevronIcon } from './CardAdminChevronIcon'
import type { ICardAdminSelectOption, ICardAdminSelectProps } from '@/views/admin/types/cardAdminSelect'

const TRIGGER_CLASSNAME =
  'flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'

const OPTION_CLASSNAME =
  'w-full rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50'

/** `max-h-60` (15rem) plus its own padding, used to decide whether the list fits below the trigger. */
const LIST_MAX_HEIGHT_PX = 256

/**
 * Admin dropdown.
 *
 * Deliberately **not** a native `<select>`: on Linux the native popup can commit whichever option ends up
 * under the cursor the moment it opens, so a single click picked a value instead of only opening the list
 * (it made the control feel like it "randomly" selected the option in the middle). This control opens on the
 * first click and only chooses on a click whose own press started inside the list, which is the same
 * behaviour as the app's other custom dropdown (`FormSelect`).
 *
 * Options are declared as `<option value="...">Label</option>` children, so call sites read like a native
 * select while the handler receives the chosen value directly.
 */
export function CardAdminSelect({
  value,
  onValueChange,
  children,
  disabled = false,
  className,
  ...props
}: ICardAdminSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [placement, setPlacement] = useState<'below' | 'above'>('below')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listboxId = `${useId()}-listbox`

  // The press that opens the list must never also choose an option: only a click whose own pointer press
  // landed inside the list is allowed to select.
  const pressStartedOnTriggerRef = useRef(false)

  const options = useMemo(() => readOptions(children), [children])
  const selectedIndex = options.findIndex((option) => option.value === value)
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleDocumentPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentPointerDown)
    return () => document.removeEventListener('mousedown', handleDocumentPointerDown)
  }, [isOpen])

  const closeList = () => {
    setIsOpen(false)
    setActiveIndex(-1)
  }

  const openList = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : findEnabledIndex(options, -1, 1))
    setPlacement(resolvePlacement(triggerRef.current))
    setIsOpen(true)
  }

  const selectOption = (option: ICardAdminSelectOption) => {
    if (!option.disabled) {
      onValueChange(option.value)
    }

    closeList()
  }

  const handleTriggerClick = () => {
    if (isOpen) {
      closeList()
      return
    }

    openList()
  }

  const handleOptionClick = (option: ICardAdminSelectOption) => {
    if (pressStartedOnTriggerRef.current) {
      // Release of the click that opened the list: swallow it so the first click can only open.
      pressStartedOnTriggerRef.current = false
      return
    }

    selectOption(option)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (disabled) {
      return
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1

        if (!isOpen) {
          pressStartedOnTriggerRef.current = false
          openList()
          return
        }

        setActiveIndex((current) => findEnabledIndex(options, current + direction, direction))
        return
      }
      case 'Home':
      case 'End': {
        if (!isOpen) {
          return
        }

        event.preventDefault()
        const isHome = event.key === 'Home'
        setActiveIndex(findEnabledIndex(options, isHome ? 0 : options.length - 1, isHome ? 1 : -1))
        return
      }
      case 'Enter':
      case ' ': {
        event.preventDefault()

        if (!isOpen) {
          pressStartedOnTriggerRef.current = false
          openList()
          return
        }

        const activeOption = options[activeIndex]
        if (activeOption) {
          selectOption(activeOption)
        }

        return
      }
      case 'Escape': {
        if (!isOpen) {
          return
        }

        event.preventDefault()
        closeList()
        return
      }
      default:
        return
    }
  }

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      closeList()
    }
  }

  return (
    <div
      ref={containerRef}
      className={twMerge('relative w-full', className)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={handleTriggerClick}
        onPointerDown={() => {
          pressStartedOnTriggerRef.current = true
        }}
        className={TRIGGER_CLASSNAME}
        {...props}
      >
        <span className="truncate">{selectedOption?.label ?? value}</span>
        <CardAdminChevronIcon expanded={isOpen} className="shrink-0 text-[var(--text-muted)]" />
      </button>

      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          data-testid="admin-select-listbox"
          className={twMerge(
            'absolute z-30 max-h-60 w-full overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--dropdown-bg)] p-1 text-sm shadow-[var(--panel-shadow)]',
            // The detail pane is a scroll container, so the list flips above a trigger that is too close to
            // the bottom to show it (a native popup never had to care).
            placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value

            return (
              <li key={`${option.value}-${index}`} role="presentation">
                <button
                  type="button"
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => handleOptionClick(option)}
                  onPointerDown={() => {
                    pressStartedOnTriggerRef.current = false
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={twMerge(
                    OPTION_CLASSNAME,
                    isSelected
                      ? 'bg-[var(--button-primary-bg)] font-semibold text-[var(--button-primary-text)]'
                      : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
                    !isSelected && index === activeIndex ? 'bg-[var(--surface-hover)]' : '',
                  )}
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

/** The list is declared with native `<option>` children; anything else is ignored. */
function readOptions(children: ReactNode): ICardAdminSelectOption[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child) || child.type !== 'option') {
      return []
    }

    const optionProps = child.props as { value?: string | number; disabled?: boolean; children?: ReactNode }

    return [
      {
        value: optionProps.value === undefined ? '' : String(optionProps.value),
        label: optionProps.children,
        disabled: Boolean(optionProps.disabled),
      },
    ]
  })
}

/** Enough room below the trigger, otherwise open upwards: the admin detail pane clips the list. */
function resolvePlacement(trigger: HTMLButtonElement | null): 'below' | 'above' {
  if (!trigger) {
    return 'below'
  }

  const rect = trigger.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const spaceAbove = rect.top

  return spaceBelow < LIST_MAX_HEIGHT_PX && spaceAbove > spaceBelow ? 'above' : 'below'
}

/** Next enabled option, wrapping around like a native select and skipping disabled entries. */
function findEnabledIndex(options: ICardAdminSelectOption[], from: number, direction: number): number {
  if (options.length === 0) {
    return -1
  }

  let index = from < 0 ? (direction > 0 ? 0 : options.length - 1) : from

  for (let step = 0; step < options.length; step += 1) {
    const candidate = ((index % options.length) + options.length) % options.length

    if (!options[candidate].disabled) {
      return candidate
    }

    index += direction
  }

  return -1
}
