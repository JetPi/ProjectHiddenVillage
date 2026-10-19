import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import { CardAdminRemoveButton } from './CardAdminRemoveButton'
import type { ICardAdminTokenFieldProps } from '@/views/admin/types/cardAdminViewTypes'

type SuggestionListBox = {
  left: number
  top: number
  width: number
  maxHeight: number
}

const SUGGESTION_GAP_PX = 4
const SUGGESTION_MAX_HEIGHT_PX = 224
const SUGGESTION_MIN_HEIGHT_PX = 72
const VIEWPORT_PADDING_PX = 8
const MAX_TYPEAHEAD_SUGGESTIONS = 6

/**
 * How close an existing value is to what the author has typed. Prefix matches come first, then word-prefix
 * matches, then substrings, and finally a small edit-distance fallback so a typo still finds its trait.
 */
function scoreSuggestion(suggestion: string, query: string): number {
  const normalizedSuggestion = suggestion.toLowerCase()
  const normalizedQuery = query.toLowerCase()

  if (normalizedSuggestion === normalizedQuery) {
    return 0
  }

  if (normalizedSuggestion.startsWith(normalizedQuery)) {
    return 1
  }

  if (normalizedSuggestion.split(/\s+/).some((word) => word.startsWith(normalizedQuery))) {
    return 2
  }

  if (normalizedSuggestion.includes(normalizedQuery)) {
    return 3
  }

  return 10 + editDistance(normalizedSuggestion, normalizedQuery)
}

function editDistance(left: string, right: string): number {
  if (left.length === 0) {
    return right.length
  }

  if (right.length === 0) {
    return left.length
  }

  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const currentRow = [leftIndex]

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      currentRow[rightIndex] = Math.min(
        currentRow[rightIndex - 1] + 1,
        previousRow[rightIndex] + 1,
        previousRow[rightIndex - 1] + substitutionCost,
      )
    }

    previousRow = currentRow
  }

  return previousRow[right.length]
}

function resolveSuggestionListBox(input: HTMLInputElement | null): SuggestionListBox | null {
  if (!input) {
    return null
  }

  const rect = input.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING_PX
  const spaceAbove = rect.top - VIEWPORT_PADDING_PX
  const opensAbove = spaceBelow < SUGGESTION_MAX_HEIGHT_PX && spaceAbove > spaceBelow
  const maxHeight = Math.min(
    SUGGESTION_MAX_HEIGHT_PX,
    Math.max(SUGGESTION_MIN_HEIGHT_PX, opensAbove ? spaceAbove : spaceBelow),
  )
  const top = opensAbove
    ? Math.max(VIEWPORT_PADDING_PX, rect.top - Math.min(maxHeight, spaceAbove) - SUGGESTION_GAP_PX)
    : rect.bottom + SUGGESTION_GAP_PX
  const width = Math.max(rect.width, 180)
  const left = Math.min(
    Math.max(VIEWPORT_PADDING_PX, rect.left),
    Math.max(VIEWPORT_PADDING_PX, window.innerWidth - width - VIEWPORT_PADDING_PX),
  )

  return { left, top, width, maxHeight }
}

/**
 * An identity list the author builds one entry at a time.
 *
 * Names and traits are stored as lists, but typing a comma/newline separated blob invites a typo that only
 * surfaces much later. This keeps each committed value visible as a chip and accepts new values with Enter.
 * When suggestions exist, typing ranks them against the current text and shows the closest matches under the
 * input; arrowing to one and pressing Enter selects it, while Enter with nothing highlighted commits exactly
 * what was typed.
 */
export function CardAdminTokenField({
  id,
  values,
  onChange,
  placeholder,
  suggestions = [],
  disabled = false,
  ariaLabel,
  chipTestId,
  maxEntries,
}: ICardAdminTokenFieldProps) {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState('')
  const [isSuggestionListOpen, setIsSuggestionListOpen] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1)
  const [suggestionListBox, setSuggestionListBox] = useState<SuggestionListBox | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const selectedValues = useMemo(
    () => new Set(values.map((value) => value.trim().toLowerCase())),
    [values],
  )

  const availableSuggestions = useMemo(
    () =>
      suggestions
        .map((suggestion) => suggestion.trim())
        .filter((suggestion) => suggestion.length > 0)
        .filter((suggestion) => !selectedValues.has(suggestion.toLowerCase()))
        .filter((suggestion, index, entries) =>
          entries.findIndex((entry) => entry.toLowerCase() === suggestion.toLowerCase()) === index),
    [selectedValues, suggestions],
  )

  const rankedSuggestions = useMemo(() => {
    const query = inputValue.trim()
    if (!query) {
      return availableSuggestions.slice(0, MAX_TYPEAHEAD_SUGGESTIONS)
    }

    const maxDistance = Math.max(2, Math.ceil(query.length / 2))
    return availableSuggestions
      .map((suggestion) => ({ suggestion, score: scoreSuggestion(suggestion, query) }))
      .filter(({ score }) => score <= 3 || score - 10 <= maxDistance)
      .sort((left, right) => left.score - right.score || left.suggestion.localeCompare(right.suggestion))
      .slice(0, MAX_TYPEAHEAD_SUGGESTIONS)
      .map(({ suggestion }) => suggestion)
  }, [availableSuggestions, inputValue])

  const isSuggestionListVisible = isSuggestionListOpen && rankedSuggestions.length > 0
  const hasReachedLimit = maxEntries !== undefined && values.length >= maxEntries
  const isInputDisabled = disabled || hasReachedLimit

  useEffect(() => {
    if (!isSuggestionListVisible) {
      return
    }

    const reposition = () => setSuggestionListBox(resolveSuggestionListBox(inputRef.current))

    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)

    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [isSuggestionListVisible, rankedSuggestions.length])

  const addValue = (rawValue: string) => {
    if (isInputDisabled) {
      return
    }

    const trimmed = rawValue.trim()
    if (!trimmed) {
      return
    }

    // If the author typed a value that already exists with different casing, prefer the catalogue's spelling.
    const canonicalValue =
      suggestions.find((suggestion) => suggestion.trim().toLowerCase() === trimmed.toLowerCase())?.trim()
      ?? trimmed

    const alreadySelected = values.some(
      (value) => value.trim().toLowerCase() === canonicalValue.toLowerCase(),
    )

    if (alreadySelected) {
      return
    }

    onChange([...values, canonicalValue])
  }

  const removeValueAt = (index: number) => {
    onChange(values.filter((_, valueIndex) => valueIndex !== index))
  }

  const closeSuggestionList = () => {
    setIsSuggestionListOpen(false)
    setActiveSuggestionIndex(-1)
    setSuggestionListBox(null)
  }

  const chooseSuggestion = (suggestion: string) => {
    addValue(suggestion)
    setInputValue('')
    closeSuggestionList()
  }

  const handleInputChange = (value: string) => {
    setInputValue(value)
    setActiveSuggestionIndex(-1)
    setIsSuggestionListOpen(true)
  }

  return (
    <div>
      <input
        id={id}
        ref={inputRef}
        value={inputValue}
        onChange={(event) => handleInputChange(event.target.value)}
        onFocus={() => {
          if (availableSuggestions.length > 0) {
            setIsSuggestionListOpen(true)
          }
        }}
        onBlur={() => {
          // The option list is portalled, so a click on it does not keep the input focused. Options prevent
          // the default mousedown specifically so the click lands before this closes the list.
          closeSuggestionList()
        }}
        onKeyDown={(event) => {
          if (isSuggestionListVisible) {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActiveSuggestionIndex((current) =>
                current < 0 ? 0 : Math.min(current + 1, rankedSuggestions.length - 1))
              return
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActiveSuggestionIndex((current) =>
                current < 0 ? rankedSuggestions.length - 1 : Math.max(current - 1, 0))
              return
            }

            if (event.key === 'Escape') {
              event.preventDefault()
              closeSuggestionList()
              return
            }
          }

          if (event.key === 'Enter') {
            event.preventDefault()
            const highlightedSuggestion = isSuggestionListVisible && activeSuggestionIndex >= 0
              ? rankedSuggestions[activeSuggestionIndex]
              : undefined

            if (highlightedSuggestion) {
              chooseSuggestion(highlightedSuggestion)
              return
            }

            addValue(inputValue)
            setInputValue('')
            closeSuggestionList()
            return
          }

          if (event.key === 'Backspace' && inputValue.length === 0 && values.length > 0) {
            removeValueAt(values.length - 1)
          }
        }}
        disabled={isInputDisabled}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={isSuggestionListVisible}
        aria-controls={`${id}-suggestions`}
        aria-activedescendant={
          isSuggestionListVisible && activeSuggestionIndex >= 0
            ? `${id}-suggestion-${activeSuggestionIndex}`
            : undefined
        }
        placeholder={hasReachedLimit ? t('admin.controls.tokenField.limitReached') : placeholder}
        className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
      />

      {isSuggestionListVisible && suggestionListBox && typeof document !== 'undefined'
        ? createPortal(
          <ul
            id={`${id}-suggestions`}
            role="listbox"
            data-testid="admin-token-suggestions"
            style={{
              left: `${suggestionListBox.left}px`,
              top: `${suggestionListBox.top}px`,
              width: `${suggestionListBox.width}px`,
              maxHeight: `${suggestionListBox.maxHeight}px`,
            }}
            className="themed-scrollbar fixed z-50 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--dropdown-bg)] p-1 text-sm shadow-[var(--panel-shadow)]"
          >
            {rankedSuggestions.map((suggestion, index) => (
              <li key={suggestion} role="presentation">
                <button
                  type="button"
                  id={`${id}-suggestion-${index}`}
                  role="option"
                  aria-selected={index === activeSuggestionIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  onClick={() => chooseSuggestion(suggestion)}
                  className={[
                    'w-full rounded-md px-3 py-2 text-left text-sm transition-colors duration-150',
                    index === activeSuggestionIndex
                      ? 'bg-[var(--surface-hover)] font-semibold text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]',
                  ].join(' ')}
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
        : null}

      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value, index) => (
            <div
              key={`${value}-${index}`}
              data-testid={chipTestId}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-primary)]"
            >
              <span>{value}</span>
              <CardAdminRemoveButton
                variant="chip"
                onClick={() => removeValueAt(index)}
                disabled={disabled}
                ariaLabel={translateKey(t, 'admin.controls.tokenField.removeEntry', { entry: value })}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
