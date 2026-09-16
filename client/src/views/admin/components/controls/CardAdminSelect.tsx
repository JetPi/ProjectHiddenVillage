import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { twMerge } from 'tailwind-merge'
import { CardAdminChevronIcon } from './CardAdminChevronIcon'
import type { ICardAdminSelectOption, ICardAdminSelectProps } from '@/views/admin/types/cardAdminSelect'

const TRIGGER_CLASSNAME =
  'flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-left text-sm text-[var(--text-primary)] focus:border-[var(--focus-ring)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'

const OPTION_CLASSNAME =
  'w-full rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * The list is portalled to the body with a fixed position, so no scroll container, `overflow-hidden`
 * wrapper or rounded card on the way up can slice it (the admin detail pane scrolls and the effect rows
 * clip, which is what used to cut dropdowns off at a container boundary).
 */
const LISTBOX_CLASSNAME =
  'fixed z-50 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--dropdown-bg)] p-1 text-sm shadow-[var(--panel-shadow)]'

/** Preferred height of the list plus the room it needs; it shrinks when the viewport has less to give. */
const LIST_MAX_HEIGHT_PX = 256
const LIST_MIN_HEIGHT_PX = 120
const LIST_GAP_PX = 4
const VIEWPORT_PADDING_PX = 8
/** Narrow triggers (the effect header chips) still deserve a readable list. */
const LISTBOX_MIN_WIDTH_PX = 160

type ICardAdminSelectListboxBox = {
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

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
  const [listboxBox, setListboxBox] = useState<ICardAdminSelectListboxBox | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const listboxRef = useRef<HTMLUListElement | null>(null)
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
      const target = event.target as Node
      // The list lives in a portal, so "outside" means outside the trigger *and* outside the list.
      if (!containerRef.current?.contains(target) && !listboxRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentPointerDown)
    return () => document.removeEventListener('mousedown', handleDocumentPointerDown)
  }, [isOpen])

  // Keep the portalled list pinned to the trigger while the detail pane (or the window) scrolls.
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const reposition = () => setListboxBox(resolveListboxBox(triggerRef.current))

    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)

    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [isOpen])

  // Arrow-key navigation can walk past the visible window: keep the highlighted option in view.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) {
      return
    }

    listboxRef.current
      ?.querySelector(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen])

  const closeList = () => {
    setIsOpen(false)
    setActiveIndex(-1)
    setListboxBox(null)
  }

  const openList = () => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : findEnabledIndex(options, -1, 1))
    setListboxBox(resolveListboxBox(triggerRef.current))
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
      className="relative w-full min-w-0"
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
        className={twMerge(TRIGGER_CLASSNAME, className)}
        {...props}
      >
        <span className="truncate">{selectedOption?.label ?? value}</span>
        <CardAdminChevronIcon expanded={isOpen} className="shrink-0 text-[var(--text-muted)]" />
      </button>

      {isOpen && listboxBox && typeof document !== 'undefined'
        ? createPortal(
          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            data-testid="admin-select-listbox"
            style={resolveListboxStyle(listboxBox)}
            className={LISTBOX_CLASSNAME}
          >
            {options.map((option, index) => {
              const isSelected = option.value === value

              return (
                <li key={`${option.value}-${index}`} role="presentation">
                  <button
                    type="button"
                    id={`${listboxId}-option-${index}`}
                    data-option-index={index}
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
          </ul>,
          document.body,
        )
        : null}
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

/**
 * Pins the portalled list to its trigger: flips above when there is no room below and clamps into the
 * viewport, so the list is fully visible wherever the trigger sits in the pane.
 */
function resolveListboxBox(trigger: HTMLButtonElement | null): ICardAdminSelectListboxBox | null {
  if (!trigger) {
    return null
  }

  const rect = trigger.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING_PX
  const spaceAbove = rect.top - VIEWPORT_PADDING_PX
  const opensAbove = spaceBelow < LIST_MAX_HEIGHT_PX && spaceAbove > spaceBelow
  const maxHeight = Math.min(
    LIST_MAX_HEIGHT_PX,
    Math.max(LIST_MIN_HEIGHT_PX, opensAbove ? spaceAbove : spaceBelow),
  )
  const width = Math.max(rect.width, LISTBOX_MIN_WIDTH_PX)
  const left = Math.min(
    Math.max(VIEWPORT_PADDING_PX, rect.left),
    Math.max(VIEWPORT_PADDING_PX, window.innerWidth - width - VIEWPORT_PADDING_PX),
  )

  if (opensAbove) {
    return { left, width, maxHeight, bottom: window.innerHeight - rect.top + LIST_GAP_PX }
  }

  return { left, width, maxHeight, top: rect.bottom + LIST_GAP_PX }
}

function resolveListboxStyle(box: ICardAdminSelectListboxBox): CSSProperties {
  return {
    left: `${box.left}px`,
    width: `${box.width}px`,
    maxHeight: `${box.maxHeight}px`,
    top: box.top === undefined ? undefined : `${box.top}px`,
    bottom: box.bottom === undefined ? undefined : `${box.bottom}px`,
  }
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
