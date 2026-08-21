import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CardImage } from '@/components/ui/cards'
import type { ICardAdminCardTileProps } from '@/views/admin/types/cardAdminCardTile'
import { CARD_ART_IMAGE_CLASS } from '@/components/ui/cards'

export function CardAdminCardTile({ card, isSelected, onSelect }: ICardAdminCardTileProps) {
  const [isPreviewVisible, setIsPreviewVisible] = useState(false)
  const [previewPosition, setPreviewPosition] = useState<{ top: number; left: number }>({ top: 12, left: 12 })
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const showPreviewTimeoutRef = useRef<number | null>(null)

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
              src={card.image}
              alt={`${card.displayName} card art preview`}
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
      <button
        ref={buttonRef}
        type="button"
        onClick={() => onSelect(card.id)}
        onMouseEnter={handlePointerEnter}
        onMouseLeave={handlePointerLeave}
        onFocus={handlePointerEnter}
        onBlur={handlePointerLeave}
        className={`w-full rounded-xl border p-2 text-left transition-colors ${
          isSelected
            ? 'border-[var(--button-primary-bg)] bg-[var(--button-primary-bg)]/10 shadow-[0_0_0_1px_var(--button-primary-bg)]'
            : 'border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]'
        }`}
      >
        <div className="space-y-2">
          <div className="aspect-[5/7] w-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
            <CardImage
              src={card.image}
              alt={`${card.displayName} card art`}
              loading="lazy"
              decoding="async"
              className={CARD_ART_IMAGE_CLASS}
              fallbackLabel={card.displayName}
            />
          </div>

          <div className="space-y-1 px-1 pb-1">
            <p className="line-clamp-1 text-sm font-semibold text-[var(--text-primary)]">{card.displayName}</p>
            <p className="text-xs text-[var(--text-secondary)]">{card.id}</p>
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span className="line-clamp-1">{card.type}</span>
              <span>{card.color}</span>
            </div>
          </div>
        </div>
      </button>

      {previewOverlay}
    </>
  )
}
