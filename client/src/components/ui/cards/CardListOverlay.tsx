import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'
import { CardImage } from '@/components/ui/cards/CardImage'
import { CardPreviewCard } from '@/components/ui/cards/CardPreviewCard'
import { CARD_ART_ASPECT_CLASS, CARD_SIZES } from '@/components/ui/cards/constants'
import { Panel } from '@/components/ui/Panel'
import type { ICardListOverlayEntry, ICardListOverlayProps } from '@/components/ui/types'

const CARD_LIST_TILE_CLASSNAME =
  'flex flex-col items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-1 text-left transition-colors duration-150'

function CardListOverlayTile({ entry }: { entry: ICardListOverlayEntry }) {
  const [isCardPreviewOpen, setIsCardPreviewOpen] = useState(false)
  const canOpenPreview = entry.card !== null

  return (
    <>
      <button
        type="button"
        data-testid={`card-list-item-${entry.instanceId}`}
        data-card-definition-id={entry.card?.id ?? ''}
        onClick={() => {
          if (canOpenPreview) {
            setIsCardPreviewOpen(true)
          }
        }}
        disabled={!canOpenPreview}
        title={entry.displayName}
        className={twMerge(
          CARD_LIST_TILE_CLASSNAME,
          canOpenPreview ? 'hover:border-[var(--focus-ring)]' : 'cursor-default',
        )}
      >
        <span className={twMerge('block w-full overflow-hidden rounded', CARD_ART_ASPECT_CLASS)}>
          <CardImage
            card={entry.card}
            variant="board"
            sizes={CARD_SIZES.listRow}
            alt={entry.displayName}
            loading="lazy"
            className="h-full w-full object-cover"
            fallbackLabel={entry.displayName}
          />
        </span>
      </button>

      {entry.card ? (
        <CardPreviewCard
          card={entry.card}
          isOpen={isCardPreviewOpen}
          onClose={() => {
            setIsCardPreviewOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

function CardListOverlay({
  isOpen,
  title,
  subtitle = '',
  entries,
  emptyMessage,
  onClose,
  testId = 'card-list-overlay',
}: ICardListOverlayProps) {
  const { t } = useTranslation()
  const dialogTitleId = useId()
  const resolvedEmptyMessage = emptyMessage ?? t('components.ui.cardListOverlay.empty')

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div
      data-testid={testId}
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
    >
      <Panel
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-2xl p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-row items-center gap-2">
            <h2 id={dialogTitleId} className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{subtitle}</p>
            ) : null}
          </div>

          <button
            type="button"
            data-testid={`${testId}-close-button`}
            aria-label={t('components.ui.cardListOverlay.close')}
            onClick={onClose}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors duration-150 hover:border-[var(--focus-ring)] hover:text-[var(--text-primary)]"
          >
            <X size={12} />
          </button>
        </div>

        {entries.length > 0 ? (
          <div
            data-testid={`${testId}-items`}
            className="themed-scrollbar mt-3 grid max-h-[min(60vh,32rem)] grid-cols-5 gap-2 overflow-y-auto"
          >
            {entries.map((entry) => (
              <CardListOverlayTile key={entry.instanceId} entry={entry} />
            ))}
          </div>
        ) : (
          <p data-testid={`${testId}-empty-message`} className="mt-3 text-sm text-[var(--text-secondary)]">
            {resolvedEmptyMessage}
          </p>
        )}
      </Panel>
    </div>,
    document.body,
  )
}

export { CardListOverlay }
