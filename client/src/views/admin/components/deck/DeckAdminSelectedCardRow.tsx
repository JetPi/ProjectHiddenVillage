import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import { CARD_ART_IMAGE_CLASS, CardImage } from '@/components/ui/cards'
import type { IDeckAdminSelectedCard } from '@/views/admin/types/deckAdminTypes'
import { MAX_NON_LEADER_COPIES } from '@/views/admin/utils/deckDraftValidation'

type IDeckAdminSelectedCardRowProps = {
  card: IDeckAdminSelectedCard
  onAddCopy: (cardId: string) => void
  onRemoveCopy: (cardId: string) => void
  onClearCard: (cardId: string) => void
}

/**
 * One line of the drafted deck. The quantity control never refuses a click: the count is allowed to go past the
 * limit so the author is not blocked mid-edit, and the row turns invalid while the validation list says why.
 */
export function DeckAdminSelectedCardRow({
  card,
  onAddCopy,
  onRemoveCopy,
  onClearCard,
}: IDeckAdminSelectedCardRowProps) {
  const { t } = useTranslation()
  const displayName = card.metadata?.displayName ?? card.cardId
  const cardId = card.metadata?.id ?? card.cardId
  const detailText = card.metadata
    ? `${card.metadata.type} · ${card.metadata.color}`
    : t('admin.decks.cards.unknownCard')

  return (
    <li
      data-testid="deck-admin-card-row"
      data-card-id={cardId}
      data-copy-count={card.quantity}
      className={`flex items-center gap-3 rounded-lg border px-2 py-2 ${
        card.exceedsCopyLimit
          ? 'border-[var(--button-primary-bg)]/60'
          : 'border-[var(--border-subtle)]'
      }`}
    >
      <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
        {card.metadata ? (
          <CardImage
            card={card.metadata}
            variant="board"
            alt={displayName}
            loading="lazy"
            decoding="async"
            className={CARD_ART_IMAGE_CLASS}
            fallbackLabel={displayName}
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-sm font-semibold text-[var(--text-primary)]">
          {displayName}
          {card.isLeader ? (
            <span className="ml-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              {t('admin.decks.cards.leaderBadge')}
            </span>
          ) : null}
        </p>
        <p className="text-[11px] text-[var(--text-secondary)]">
          {cardId} · {detailText}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onRemoveCopy(cardId)}
          aria-label={translateKey(t, 'admin.decks.cards.removeCopyOf', { name: displayName })}
          data-testid="deck-admin-card-remove"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          −
        </button>

        <span
          data-testid="deck-admin-card-count"
          className={`inline-flex min-w-8 items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-semibold ${
            card.exceedsCopyLimit
              ? 'border-[var(--button-primary-bg)] text-[var(--button-primary-bg)]'
              : 'border-[var(--border-subtle)] text-[var(--text-primary)]'
          }`}
          title={t('admin.decks.cards.copyLimitHint', { max: MAX_NON_LEADER_COPIES })}
        >
          {card.quantity}
        </span>

        <button
          type="button"
          onClick={() => onAddCopy(cardId)}
          aria-label={translateKey(t, 'admin.decks.cards.addCopyOf', { name: displayName })}
          data-testid="deck-admin-card-add"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-hover)]"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => onClearCard(cardId)}
          aria-label={translateKey(t, 'admin.decks.cards.removeAllOf', { name: displayName })}
          data-testid="deck-admin-card-clear"
          className="ml-1 rounded-md border border-transparent px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          {t('admin.decks.cards.clear')}
        </button>
      </div>
    </li>
  )
}
