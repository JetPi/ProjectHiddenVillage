import { Fragment, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'
import { CardImage } from '@/components/ui/cards/CardImage'
import { CARD_ART_ASPECT_CLASS, CARD_ART_FIT_CLASS, CARD_SIZES } from '@/components/ui/cards/constants'
import { resolveKeywordDescription } from '@/components/ui/cards/utils'
import { getPrimaryName, renderDescriptionLineWithKeywordPills, splitDescriptionLines } from '@/components/ui/cards/utils'
import type { ICardPreviewCardProps } from '@/components/ui/types'

type IKeywordTooltipState = {
    text: string
    x: number
    y: number
    place: 'top' | 'bottom'
    width: number
    unit: number
} | null

/**
 * Reads the panel's own resolved scale from any element inside it.
 *
 * `--game-preview-unit` is registered as a `<length>`, so the computed value comes back in pixels instead of as the
 * `min(...)` source text. The element passed in is the hovered keyword, which is inside the panel, so the inherited
 * value is the panel's - no ref has to be held for it.
 */
function readPreviewUnit(element: HTMLElement): number {
    const parsed = Number.parseFloat(getComputedStyle(element).getPropertyValue('--game-preview-unit'))
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function CardPreviewCard({
    card,
    isOpen,
    onClose,
}: ICardPreviewCardProps) {
    const { t } = useTranslation()
    const dialogTitleId = useId()
    const [keywordTooltipState, setKeywordTooltipState] = useState<IKeywordTooltipState>(null)

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

    const primaryName = getPrimaryName(card)
    const cardHasLife = card.life !== null
    const vitalityLabel = cardHasLife ? t('components.ui.cardPreview.life') : t('components.ui.cardPreview.health')
    const vitalityValue = cardHasLife ? (card.life ?? '-') : (card.health ?? '-')
    const descriptionLines = splitDescriptionLines(card.description)

    function handleKeywordMouseEnter(event: React.MouseEvent<HTMLSpanElement>, keyword: string) {
        const keywordDescription = resolveKeywordDescription(keyword)
        if (!keywordDescription) {
            setKeywordTooltipState(null)
            return
        }

        // The panel is its own token scope (it is portalled out of the board), so its resolved preview unit is what the
        // tooltip has to be measured against: a 224px tooltip next to a 900px card is unreadable at 4K, and a 573px one
        // next to a 352px card at 720p is a paragraph. Everything here is a multiple of that unit.
        const unit = readPreviewUnit(event.currentTarget)
        const rect = event.currentTarget.getBoundingClientRect()
        const tooltipWidth = Math.round(224 * unit)
        const offset = Math.round(8 * unit)
        const viewportPadding = Math.round(8 * unit)
        const centerX = rect.left + rect.width / 2
        const minX = viewportPadding + tooltipWidth / 2
        const maxX = window.innerWidth - viewportPadding - tooltipWidth / 2
        const x = Math.min(maxX, Math.max(minX, centerX))

        const topCandidateY = rect.top - offset
        if (topCandidateY >= 48 * unit) {
            setKeywordTooltipState({ text: keywordDescription, x, y: topCandidateY, place: 'top', width: tooltipWidth, unit })
            return
        }

        setKeywordTooltipState({
            text: keywordDescription,
            x,
            y: Math.min(window.innerHeight - viewportPadding, rect.bottom + offset),
            place: 'bottom',
            width: tooltipWidth,
            unit,
        })
    }

    function handleKeywordMouseLeave() {
        setKeywordTooltipState(null)
    }

    const descriptionContent =
        descriptionLines.length > 0
            ? descriptionLines.map((line, index) => (
                  <Fragment key={`description-line-${index}`}>
                      {index > 0 ? <br /> : null}
                      {renderDescriptionLineWithKeywordPills(
                          line,
                          index,
                          handleKeywordMouseEnter,
                          handleKeywordMouseLeave,
                          card.supportCost,
                      )}
                  </Fragment>
              ))
            : t('components.ui.cardPreview.noDescription')

    return createPortal(
              <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={dialogTitleId}
                  onClick={onClose}
                  // The panel is portalled to `document.body`, which is outside the board's token scope, so it has to
                  // re-declare that scope itself: `[data-game-preview]` in `index.css` carries the game tokens plus the
                  // panel's own width-derived type scale.
                  data-game-preview="true"
                  className="fixed inset-0 z-50 bg-black/55"
              >
                  <div className="relative flex h-screen w-screen items-stretch justify-start p-0">
                      <h4 id={dialogTitleId} className="sr-only">
                          {primaryName}
                      </h4>

                      <div
                          // The reading surface for card art: it grows with the board unit up to the master's native
                          // 900px, so the printed text can always be inspected at 2-3x the board size. Its type scale
                          // (`--game-preview-unit`) tracks the same three bounds, so the details never outgrow the art.
                          className="card-preview-slide-in themed-scrollbar relative flex h-screen max-h-screen w-[min(92vw,calc(352*var(--game-unit)*var(--game-type-boost)),900px)] flex-col justify-start gap-[var(--game-preview-gap)] overflow-y-auto rounded-none border-r border-[var(--border-subtle)] bg-[var(--surface)]/96 p-[var(--game-preview-padding)] shadow-2xl"
                          onClick={(event) => event.stopPropagation()}
                      >
                          <div className="shrink-0 border-b border-[var(--border-subtle)] pb-[calc(8*var(--game-preview-unit))] text-center">
                              <div className="flex items-center justify-center gap-[calc(6*var(--game-preview-unit))]">
                                  <h2 className="min-w-0 text-[length:var(--game-dialog-font-3xl)] font-black leading-tight text-[var(--text-primary)]">{primaryName}</h2>
                                  <span className="shrink-0 self-end pb-[calc(2*var(--game-preview-unit))] text-[length:var(--game-dialog-font-lg)] font-bold uppercase tracking-[0.04em] text-[var(--text-muted)]">
                                      {card.type || t('components.ui.cardPreview.unknownType')}
                                  </span>
                              </div>

                              {/* The traits sit between the title and the art, so they carry the same weight as the ability
                                  text: they are printed information the reader is here to check, not a caption. */}
                              <p className="mt-[calc(4*var(--game-preview-unit))] text-[length:var(--game-dialog-font-xl)] leading-relaxed text-[var(--text-secondary)]">
                                  {card.traits.length > 0 ? card.traits.join(' • ') : t('components.ui.cardPreview.noTraits')}
                              </p>
                          </div>

                          <div className="shrink-0">
                              {/* The one surface that shows the whole card: cropping here would hide the art the
                                  player opened the panel to inspect. It is sized in panel units rather than to the full
                                  width - the art is what the details are about, but the details are why the panel opens,
                                  and a full-width card left them a strip under it. */}
                              <div className={twMerge('mx-auto w-[var(--game-preview-art-width)] max-w-full', CARD_ART_ASPECT_CLASS)}>
                                  <CardImage
                                      card={card}
                                      variant="preview"
                                      sizes={CARD_SIZES.previewPanel}
                                      alt={primaryName}
                                      loading="eager"
                                      className={`h-full w-full rounded-[var(--game-preview-radius)] ${CARD_ART_FIT_CLASS}`}
                                  />
                              </div>
                          </div>

                          {/* 12 units, not 6: at 6 the three pills read as one striped bar at 720p once the labels grew. */}
                          <div className="grid w-full grid-cols-3 gap-[calc(12*var(--game-preview-unit))]">
                                  <p className="flex w-full flex-col items-center justify-center rounded-[var(--game-preview-radius)] border border-[var(--stat-pill-pow-border)] bg-[var(--stat-pill-pow-bg)] px-[calc(10*var(--game-preview-unit))] py-[calc(7*var(--game-preview-unit))] text-center leading-tight text-[var(--stat-pill-pow-text)]">
                                      <span className="text-[length:var(--game-dialog-font-lg)] font-semibold uppercase tracking-wide">{t('components.ui.cardPreview.power')}</span>
                                      <span className="text-[length:var(--game-dialog-font-2xl)] font-bold leading-none">{card.power}</span>
                                  </p>
                                  <p className="flex w-full flex-col items-center justify-center rounded-[var(--game-preview-radius)] border border-[var(--stat-pill-dmg-border)] bg-[var(--stat-pill-dmg-bg)] px-[calc(10*var(--game-preview-unit))] py-[calc(7*var(--game-preview-unit))] text-center leading-tight text-[var(--stat-pill-dmg-text)]">
                                      <span className="text-[length:var(--game-dialog-font-lg)] font-semibold uppercase tracking-wide">{t('components.ui.cardPreview.damage')}</span>
                                      <span className="text-[length:var(--game-dialog-font-2xl)] font-bold leading-none">{card.damage}</span>
                                  </p>
                                  <p className={twMerge(
                                      'flex w-full flex-col items-center justify-center rounded-[var(--game-preview-radius)] border px-[calc(10*var(--game-preview-unit))] py-[calc(7*var(--game-preview-unit))] text-center leading-tight',
                                      cardHasLife
                                          ? 'border-[var(--stat-pill-life-border)] bg-[var(--stat-pill-life-bg)] text-[var(--stat-pill-life-text)]'
                                          : 'border-[var(--stat-pill-hp-border)] bg-[var(--stat-pill-hp-bg)] text-[var(--stat-pill-hp-text)]',
                                  )}>
                                      <span className="text-[length:var(--game-dialog-font-lg)] font-semibold uppercase tracking-wide">{vitalityLabel}</span>
                                      <span className="text-[length:var(--game-dialog-font-2xl)] font-bold leading-none">{vitalityValue}</span>
                                  </p>

                              {/* The ability text is the reason the panel opens, so it sits a step over the traits and the
                                  stat labels and reads as body copy rather than a footnote. */}
                              <p className="col-span-3 mt-[calc(8*var(--game-preview-unit))] text-[length:var(--game-dialog-font-xl)] leading-relaxed text-[var(--text-secondary)]">
                                  {descriptionContent}
                              </p>
                          </div>
                      </div>
                  </div>

                  {keywordTooltipState ? (
                      <div
                          className="pointer-events-none fixed z-[70] border border-slate-700 bg-slate-950/95 text-[length:var(--game-dialog-font-md)] font-medium normal-case tracking-normal text-slate-100 shadow-2xl"
                          style={{
                              left: `${keywordTooltipState.x}px`,
                              top: `${keywordTooltipState.y}px`,
                              width: `${keywordTooltipState.width}px`,
                              padding: `${Math.round(6 * keywordTooltipState.unit)}px ${Math.round(10 * keywordTooltipState.unit)}px`,
                              borderRadius: `${Math.round(6 * keywordTooltipState.unit)}px`,
                              transform: keywordTooltipState.place === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
                          }}
                      >
                          {keywordTooltipState.text}
                      </div>
                  ) : null}
              </div>,
              document.body,
          )
}
