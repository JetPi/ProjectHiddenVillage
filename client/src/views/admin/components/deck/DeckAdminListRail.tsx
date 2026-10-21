import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { resolveDeckCardColorStyling } from '@/views/admin/utils/deckCardColorStyles'
import type { IDeckAdminListRailProps } from './types'

/**
 * The public decks the builder can open. Navigation is links, not click handlers: a deck has a URL
 * (`/admin/decks/:deckId`), so middle-click and open-in-new-tab keep working and a reload lands on the same deck.
 */
export function DeckAdminListRail({ decks, selectedDeckId, isLoading, isError }: IDeckAdminListRailProps) {
  const { t } = useTranslation()

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-sm font-bold tracking-[0.12em] text-[var(--text-primary)]">
          {t('admin.decks.rail.title')}
        </h1>
        <Link
          to="/admin/decks"
          data-testid="admin-deck-new"
          className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--button-primary-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--button-primary-text)] transition-colors duration-200 hover:bg-[var(--button-primary-hover)]"
        >
          {t('admin.decks.rail.newDeck')}
        </Link>
      </div>

      <div className="themed-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-1.5">
        {isLoading ? (
          <p className="px-2 py-3 text-xs text-[var(--text-secondary)]">{t('admin.decks.rail.loading')}</p>
        ) : null}

        {isError ? (
          <p className="px-2 py-3 text-xs text-[var(--text-secondary)]">{t('admin.decks.rail.loadFailed')}</p>
        ) : null}

        {!isLoading && !isError && decks.length === 0 ? (
          <p className="px-2 py-3 text-xs text-[var(--text-secondary)]">{t('admin.decks.rail.empty')}</p>
        ) : null}

        {!isLoading && !isError && decks.length > 0 ? (
          <ul className="space-y-1">
            {decks.map((deck) => {
              const totalCards = deck.cards.reduce((total, card) => total + card.quantity, 0)
              const isSelected = deck.id === selectedDeckId
              // The rail is a list of decks, so both the surface and the outline are the deck's leader colour -
              // the card every other line in the deck has to match. It reuses the catalogue tile's muted tones.
              const colorStyling = resolveDeckCardColorStyling(deck.leaderColor)

              return (
                <li key={deck.id}>
                  <Link
                    to={`/admin/decks/${deck.id}`}
                    data-testid="admin-deck-list-item"
                    data-deck-id={deck.id}
                    data-card-color={deck.leaderColor ?? undefined}
                    data-color-tone={colorStyling.tone}
                    data-selected={isSelected ? 'true' : undefined}
                    aria-current={isSelected ? 'page' : undefined}
                    className={`block rounded-lg border px-2.5 py-2 transition-colors ${colorStyling.outlineClassName} ${colorStyling.surfaceClassName} ${
                      // Selection is a thicker inner edge in the same tone; a ring in the primary colour would add
                      // a second colour to the very outline this highlight exists to show.
                      isSelected ? colorStyling.selectedAccentClassName : colorStyling.hoverClassName
                    }`}
                  >
                    <p className={`line-clamp-1 text-sm font-semibold ${colorStyling.primaryTextClassName}`}>
                      {deck.name.trim() || t('admin.decks.rail.unnamed')}
                    </p>
                    <p className={`text-[11px] ${colorStyling.secondaryTextClassName}`}>
                      {t('admin.decks.rail.cardCount', { count: totalCards })}
                    </p>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </aside>
  )
}
