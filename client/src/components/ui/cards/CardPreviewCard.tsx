import { Fragment, useEffect, useId } from 'react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { twMerge } from 'tailwind-merge'
import { CardImage } from '@/components/ui/cards/CardImage'
import { resolveKeywordDescription } from '@/components/ui/cards/utils'
import { getPrimaryName, renderDescriptionLineWithKeywordPills, splitDescriptionLines } from '@/components/ui/cards/utils'
import type { ICardPreviewCardProps } from '@/components/ui/types'

type IKeywordTooltipState = {
    text: string
    x: number
    y: number
    place: 'top' | 'bottom'
} | null

export function CardPreviewCard({
    card,
    isOpen,
    onClose,
}: ICardPreviewCardProps) {
    const dialogTitleId = useId()
    const primaryName = getPrimaryName(card)
    const cardHasLife = card.life !== null
    const [keywordTooltipState, setKeywordTooltipState] = useState<IKeywordTooltipState>(null)
    const vitalityLabel = cardHasLife ? 'LIFE' : 'HEALTH'
    const vitalityValue = cardHasLife ? (card.life ?? '-') : (card.health ?? '-')
    const descriptionLines = splitDescriptionLines(card.description)

    function handleKeywordMouseEnter(event: React.MouseEvent<HTMLSpanElement>, keyword: string) {
        const keywordDescription = resolveKeywordDescription(keyword)
        if (!keywordDescription) {
            setKeywordTooltipState(null)
            return
        }

        const rect = event.currentTarget.getBoundingClientRect()
        const tooltipWidth = 224
        const viewportPadding = 8
        const centerX = rect.left + rect.width / 2
        const minX = viewportPadding + tooltipWidth / 2
        const maxX = window.innerWidth - viewportPadding - tooltipWidth / 2
        const x = Math.min(maxX, Math.max(minX, centerX))

        const topCandidateY = rect.top - 8
        if (topCandidateY >= 48) {
            setKeywordTooltipState({ text: keywordDescription, x, y: topCandidateY, place: 'top' })
            return
        }

        setKeywordTooltipState({
            text: keywordDescription,
            x,
            y: Math.min(window.innerHeight - viewportPadding, rect.bottom + 8),
            place: 'bottom',
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
            : 'No card description provided yet.'

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
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={dialogTitleId}
                  onClick={onClose}
                  className="fixed inset-0 z-50 bg-black/55"
              >
                  <div className="relative flex h-screen w-screen items-stretch justify-start p-0">
                      <h4 id={dialogTitleId} className="sr-only">
                          {primaryName}
                      </h4>

                      <div
                          className="card-preview-slide-in relative flex h-screen max-h-screen w-[min(92vw,22rem)] flex-col justify-start gap-3 overflow-y-auto rounded-none border-r border-[var(--border-subtle)] bg-[var(--surface)]/96 p-2 shadow-2xl sm:p-3"
                          onClick={(event) => event.stopPropagation()}
                      >
                          <div className="shrink-0 border-b border-[var(--border-subtle)] pb-2 text-center">
                              <div className="flex items-center justify-center gap-2">
                                  <h2 className="text-xl font-black leading-tight text-[var(--text-primary)] sm:text-2xl">{primaryName}</h2>
                                  <span className="self-end pb-0.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                                      {card.type || 'Unknown type'}
                                  </span>
                              </div>

                              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)] sm:text-sm">
                                  {card.traits.length > 0 ? card.traits.join(' • ') : 'No traits'}
                              </p>
                          </div>

                          <div className="shrink-0">
                              <div className="aspect-[600/831] w-full max-h-[70vh]">
                                  <CardImage
                                      src={card.image}
                                      alt={primaryName}
                                      loading="eager"
                                      className="h-full w-full rounded-lg object-contain"
                                  />
                              </div>
                          </div>

                          <div className="grid w-full grid-cols-3 gap-1.5">
                                  <p className="flex w-full flex-col items-center justify-center rounded-md border border-[var(--stat-pill-pow-border)] bg-[var(--stat-pill-pow-bg)] px-2.5 py-1 text-center leading-tight text-[var(--stat-pill-pow-text)]">
                                      <span className="text-[0.65rem] font-medium tracking-wide sm:text-[0.7rem]">POWER</span>
                                      <span className="text-xs font-semibold sm:text-sm">{card.power}</span>
                                  </p>
                                  <p className="flex w-full flex-col items-center justify-center rounded-md border border-[var(--stat-pill-dmg-border)] bg-[var(--stat-pill-dmg-bg)] px-2.5 py-1 text-center leading-tight text-[var(--stat-pill-dmg-text)]">
                                      <span className="text-[0.65rem] font-medium tracking-wide sm:text-[0.7rem]">DAMAGE</span>
                                      <span className="text-xs font-semibold sm:text-sm">{card.damage}</span>
                                  </p>
                                  <p className={twMerge(
                                      'flex w-full flex-col items-center justify-center rounded-md border px-2.5 py-1 text-center leading-tight',
                                      cardHasLife
                                          ? 'border-[var(--stat-pill-life-border)] bg-[var(--stat-pill-life-bg)] text-[var(--stat-pill-life-text)]'
                                          : 'border-[var(--stat-pill-hp-border)] bg-[var(--stat-pill-hp-bg)] text-[var(--stat-pill-hp-text)]',
                                  )}>
                                      <span className="text-[0.65rem] font-medium tracking-wide sm:text-[0.7rem]">{vitalityLabel}</span>
                                      <span className="text-xs font-semibold sm:text-sm">{vitalityValue}</span>
                                  </p>

                              <p className="col-span-3 mt-2 text-xs leading-relaxed text-[var(--text-secondary)] sm:mt-3 sm:text-sm">
                                  {descriptionContent}
                              </p>
                          </div>
                      </div>
                  </div>

                  {keywordTooltipState ? (
                      <div
                          className="pointer-events-none fixed z-[70] w-[14rem] rounded-md border border-slate-700 bg-slate-950/95 px-2.5 py-1.5 text-[0.8rem] font-medium normal-case tracking-normal text-slate-100 shadow-2xl"
                          style={{
                              left: `${keywordTooltipState.x}px`,
                              top: `${keywordTooltipState.y}px`,
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
