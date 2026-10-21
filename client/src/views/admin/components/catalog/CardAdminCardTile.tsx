import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import { CardImage } from '@/components/ui/cards'
import type { ICardAdminCardTileProps } from '@/views/admin/types/cardAdminViewTypes'
import { CARD_ART_IMAGE_CLASS } from '@/components/ui/cards'
import { resolveDeckCardColorStyling } from '@/views/admin/utils/deckCardColorStyles'

export function CardAdminCardTile({
  card,
  isSelected,
  onSelect,
  selectedCount,
  maxCopies,
  onAdd,
  onRemove,
}: ICardAdminCardTileProps) {
  const { t } = useTranslation()
  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const [previewPosition, setPreviewPosition] = useState<{ top: number; left: number }>({ top: 12, left: 12 })
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const showPreviewTimeoutRef = useRef<number | null>(null)

  const isQuantityMode = onAdd !== undefined
  const copyCount = selectedCount ?? 0
  const exceedsCopyLimit = isQuantityMode && maxCopies !== undefined && copyCount > maxCopies

  const colorStyling = resolveDeckCardColorStyling(card.color)
  const isMarked = isSelected || (isQuantityMode && copyCount > 0)

  const clearPreviewTimeout = () => {
    if (showPreviewTimeoutRef.current === null) {
      return
    }

    window.clearTimeout(showPreviewTimeoutRef.current)
    showPreviewTimeoutRef.current = null
  }

  const updatePreviewPosition = () => {
    const cardElement = buttonRef.current
    if (!cardElement) {
      return
    }

    const rect = cardElement.getBoundingClientRect()
    const previewWidth = 320
    const previewHeight = 448
    const screenPadding = 12
    const sideGap = 14

    const canPlaceToRight = rect.right + sideGap + previewWidth <= window.innerWidth - screenPadding
    const nextLeft = canPlaceToRight
      ? rect.right + sideGap
      : Math.max(screenPadding, rect.left - previewWidth - sideGap)

    const centeredTop = rect.top + rect.height / 2 - previewHeight / 2
    const nextTop = Math.min(
      Math.max(screenPadding, centeredTop),
      window.innerHeight - previewHeight - screenPadding,
    )

    setPreviewPosition({ top: nextTop, left: nextLeft })
  }

  const handlePointerEnter = () => {
    clearPreviewTimeout()
    updatePreviewPosition()

    showPreviewTimeoutRef.current = window.setTimeout(() => {
      setIsPreviewVisible(true)
      showPreviewTimeoutRef.current = null
    }, 380)
  }

  const handlePointerLeave = () => {
    clearPreviewTimeout()
    setIsPreviewVisible(false)
  }

  useEffect(() => () => {
    clearPreviewTimeout()
  }, [])

  const handleActivate = () => {
    if (isQuantityMode) {
      onAdd?.(card.id)
      return
    }

    onSelect(card.id)
  }

  const previewOverlay = isPreviewVisible
    ? createPortal(
      <div
        className="pointer-events-none fixed z-50"
        style={{ top: previewPosition.top, left: previewPosition.left }}
        aria-hidden="true"
      >
        <div className="w-80 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-2 shadow-2xl">
          <div className="aspect-[5/7] w-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
            <CardImage
              card={card}
              variant="preview"
              alt={translateKey(t, 'admin.catalog.cardArtPreviewAlt', { name: card.displayName })}
              loading="lazy"
              decoding="async"
              className={CARD_ART_IMAGE_CLASS}
              fallbackLabel={card.displayName}
            />
          </div>
        </div>
      </div>,
      document.body,
    )
    : null

  return (
    <>
      <div
        className="relative"
        data-testid="catalog-card-tile"
        data-card-id={card.id}
        data-card-color={card.color}
        data-color-tone={colorStyling.tone}
        data-marked={isMarked ? 'true' : undefined}
        data-copy-count={isQuantityMode ? copyCount : undefined}
      >
        <button
          ref={buttonRef}
          type="button"
          onClick={handleActivate}
          onMouseEnter={handlePointerEnter}
          onMouseLeave={handlePointerLeave}
          onFocus={handlePointerEnter}
          onBlur={handlePointerLeave}
          className={`w-full rounded-xl border p-2 text-left transition-colors ${
            isMarked
              ? 'border-[var(--button-primary-bg)] shadow-[0_0_0_1px_var(--button-primary-bg)]'
              : colorStyling.outlineClassName
          } ${colorStyling.surfaceClassName} ${isMarked ? '' : colorStyling.hoverClassName}`}
        >
          <div className="space-y-2">
            <div className={`aspect-[5/7] w-full overflow-hidden rounded-lg border bg-[var(--surface-muted)] ${colorStyling.mediaBorderClassName}`}>
              <CardImage
                card={card}
                variant="board"
                alt={translateKey(t, 'admin.catalog.cardArtAlt', { name: card.displayName })}
                loading="lazy"
                decoding="async"
                className={CARD_ART_IMAGE_CLASS}
                fallbackLabel={card.displayName}
              />
            </div>

            <div className="space-y-1 px-1 pb-1">
              <p className={`line-clamp-1 text-sm font-semibold ${colorStyling.primaryTextClassName}`}>
                {card.displayName}
              </p>
              <p className={`text-xs ${colorStyling.secondaryTextClassName}`}>{card.id}</p>
              <div className={`flex items-center justify-between text-xs ${colorStyling.secondaryTextClassName}`}>
                <span className="line-clamp-1">{card.type}</span>
                <span>{card.color}</span>
              </div>
            </div>
          </div>
        </button>

        {isQuantityMode && copyCount > 0 ? (
          <>
            <span
              aria-hidden="true"
              data-testid="catalog-card-copy-count"
              className={`pointer-events-none absolute left-1 top-1 inline-flex min-w-6 items-center justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold shadow-sm ${
                exceedsCopyLimit
                  ? 'border-[var(--button-primary-bg)] bg-[var(--button-primary-bg)] text-[var(--button-primary-text)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface)] text-[var(--text-primary)]'
              }`}
            >
              {copyCount}
            </span>

            {onRemove ? (
              <button
                type="button"
                onClick={() => onRemove(card.id)}
                data-testid="catalog-card-remove-copy"
                aria-label={translateKey(t, 'admin.decks.cards.removeCopyOf', { name: card.displayName })}
                className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] text-sm font-semibold text-[var(--text-primary)] shadow-sm transition-colors hover:bg-[var(--surface-hover)]"
              >
                −
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {previewOverlay}
    </>
  )
}
