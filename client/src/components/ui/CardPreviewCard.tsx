import { Fragment, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { twMerge } from 'tailwind-merge'
import type { ICardCatalogItemResponse } from '../../types/cardCatalog'
import { CardImage } from './CardImage'

type ICardPreviewCardProps = {
    card: ICardCatalogItemResponse
    className?: string
    imageLoading?: 'lazy' | 'eager'
}

function getPrimaryName(card: ICardCatalogItemResponse): string {
    if (card.displayName.trim()) {
        return card.displayName
    }

    if (card.name.length > 0 && card.name[0].trim()) {
        return card.name[0]
    }

    return card.id
}

function getCardIdentityLine(card: ICardCatalogItemResponse): string {
    return [card.type, card.color].filter(Boolean).join(' - ')
}

function splitDescriptionLines(description: string | null | undefined): string[] {
    if (!description?.trim()) {
        return []
    }

    return description.split(/<br\s*\/?>/gi).map((line) => line.trim())
}

export function CardPreviewCard({ card, className, imageLoading = 'lazy' }: ICardPreviewCardProps) {
    const [isZoomOpen, setIsZoomOpen] = useState(false)
    const dialogTitleId = useId()
    const primaryName = getPrimaryName(card)
    const identityLine = getCardIdentityLine(card)
    const cardHasLife = card.life !== null
    const powerPillClass =
        'border-[var(--stat-pill-pow-border)] bg-[var(--stat-pill-pow-bg)] text-[var(--stat-pill-pow-text)]'
    const damagePillClass =
        'border-[var(--stat-pill-dmg-border)] bg-[var(--stat-pill-dmg-bg)] text-[var(--stat-pill-dmg-text)]'
    const vitalityPillClass = cardHasLife
        ? 'border-[var(--stat-pill-life-border)] bg-[var(--stat-pill-life-bg)] text-[var(--stat-pill-life-text)]'
        : 'border-[var(--stat-pill-hp-border)] bg-[var(--stat-pill-hp-bg)] text-[var(--stat-pill-hp-text)]'
    const vitalityLabel = cardHasLife ? 'LIFE' : 'HP'
    const vitalityValue = cardHasLife ? (card.life ?? '-') : (card.health ?? '-')
    const descriptionLines = splitDescriptionLines(card.description)
    const descriptionContent =
        descriptionLines.length > 0
            ? descriptionLines.map((line, index) => (
                  <Fragment key={`description-line-${index}`}>
                      {index > 0 ? <br /> : null}
                      {line}
                  </Fragment>
              ))
            : 'No card description provided yet.'

    useEffect(() => {
        if (!isZoomOpen) {
            return
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsZoomOpen(false)
            }
        }

        window.addEventListener('keydown', handleEscape)
        return () => window.removeEventListener('keydown', handleEscape)
    }, [isZoomOpen])

    useEffect(() => {
        if (!isZoomOpen) {
            return
        }

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [isZoomOpen])

    return (
        <article
            className={twMerge(
                'grid grid-cols-3 gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4 transition-colors duration-300',
                className,
            )}
        >
            <div className="col-span-3">
                <h3 className="text-xl font-semibold text-[var(--text-primary)]">{primaryName}</h3>
                <p className="text-sm text-[var(--text-secondary)]">{identityLine || 'Unknown card identity'}</p>
            </div>

            <div className="col-span-3">
                <button
                    type="button"
                    onClick={() => setIsZoomOpen(true)}
                    aria-label={`Zoom image for ${primaryName}`}
                    className="block w-full overflow-hidden rounded-xl border border-transparent transition-colors duration-200 hover:border-[var(--border-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-muted)]"
                >
                    <div className="aspect-[600/831] w-full">
                        <CardImage
                            src={card.image}
                            alt={primaryName}
                            loading={imageLoading}
                            className="h-full w-full rounded-xl object-contain"
                        />
                    </div>
                </button>
            </div>

            <div className="col-span-3 flex flex-wrap items-start justify-center gap-2 text-sm">
                <p className={twMerge('inline-flex w-fit flex-col items-center rounded-lg border px-2.5 py-1 leading-tight', powerPillClass)}>
                    <span className="text-[0.7rem] font-medium tracking-wide">POW</span>
                    <span className="text-sm font-semibold">{card.power}</span>
                </p>
                <p className={twMerge('inline-flex w-fit flex-col items-center rounded-lg border px-2.5 py-1 leading-tight', damagePillClass)}>
                    <span className="text-[0.7rem] font-medium tracking-wide">DMG</span>
                    <span className="text-sm font-semibold">{card.damage}</span>
                </p>
                <p className={twMerge('inline-flex w-fit flex-col items-center rounded-lg border px-2.5 py-1 leading-tight', vitalityPillClass)}>
                    <span className="text-[0.7rem] font-medium tracking-wide">{vitalityLabel}</span>
                    <span className="text-sm font-semibold">{vitalityValue}</span>
                </p>
            </div>

            <p className="col-span-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                {descriptionContent}
            </p>

            {isZoomOpen
                ? createPortal(
                      <div
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby={dialogTitleId}
                          onClick={() => setIsZoomOpen(false)}
                          className="fixed inset-0 z-50 bg-black/80"
                      >
                          <div className="relative flex h-screen w-screen items-center justify-center p-4 sm:p-6 md:p-8">
                              <button
                                  type="button"
                                  onClick={() => setIsZoomOpen(false)}
                                  aria-label="Close enlarged card preview"
                                  className="absolute right-4 top-4 z-10 rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]/90 px-3 py-1.5 text-sm text-[var(--text-primary)] shadow-lg transition-colors duration-200 hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] sm:right-6 sm:top-6"
                              >
                                  Close
                              </button>

                              <h4 id={dialogTitleId} className="sr-only">
                                  {primaryName}
                              </h4>

                              <div
                                  className="flex h-[88vh] max-h-[88vh] w-[min(88vw,calc(88vh*600/831))] max-w-[88vw] flex-col gap-3 sm:gap-4"
                                  onClick={(event) => event.stopPropagation()}
                              >
                                  <div className="min-h-0 flex-1">
                                      <div className="aspect-[600/831] h-full w-full">
                                          <CardImage
                                              src={card.image}
                                              alt={primaryName}
                                              loading="eager"
                                              className="h-full w-full object-contain"
                                          />
                                      </div>
                                  </div>

                                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]/95 px-3 py-2 text-center shadow-lg sm:px-4 sm:py-3">
                                      <div className="flex flex-wrap items-start justify-center gap-2 text-[var(--text-secondary)] sm:gap-3">
                                          <p className={twMerge('inline-flex w-fit flex-col items-center rounded-md border px-2.5 py-1 leading-tight', powerPillClass)}>
                                              <span className="text-[0.65rem] font-medium tracking-wide sm:text-[0.7rem]">POW</span>
                                              <span className="text-xs font-semibold sm:text-sm">{card.power}</span>
                                          </p>
                                          <p className={twMerge('inline-flex w-fit flex-col items-center rounded-md border px-2.5 py-1 leading-tight', damagePillClass)}>
                                              <span className="text-[0.65rem] font-medium tracking-wide sm:text-[0.7rem]">DMG</span>
                                              <span className="text-xs font-semibold sm:text-sm">{card.damage}</span>
                                          </p>
                                          <p className={twMerge('inline-flex w-fit flex-col items-center rounded-md border px-2.5 py-1 leading-tight', vitalityPillClass)}>
                                              <span className="text-[0.65rem] font-medium tracking-wide sm:text-[0.7rem]">{vitalityLabel}</span>
                                              <span className="text-xs font-semibold sm:text-sm">{vitalityValue}</span>
                                          </p>
                                      </div>

                                      <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)] sm:mt-3 sm:text-sm">
                                          {descriptionContent}
                                      </p>
                                  </div>
                              </div>
                          </div>
                      </div>,
                      document.body,
                  )
                : null}
        </article>
    )
}
