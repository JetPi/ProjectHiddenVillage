import { translateKey } from '@/i18n'
import { CARD_ART_IMAGE_CLASS, CardImage } from '@/components/ui/cards'
import type { IDeckAdminSelectedCard } from '@/views/admin/types/deckAdminTypes'
import type { TFunction } from 'node_modules/i18next/typescript/t'

export function LeaderCardIndicator({leaderCard, onClearLeader, totalCopies, t} : {leaderCard: IDeckAdminSelectedCard | null, onClearLeader: () => void, t: TFunction<"translation", undefined>, totalCopies: number}) {
  const leaderName = leaderCard?.metadata?.displayName ?? leaderCard?.cardId ?? null
  const leaderDetail = leaderCard?.metadata
    ? `${leaderCard.metadata.type} · ${leaderCard.metadata.color}`
    : null

  return <div
    data-testid="deck-admin-leader-slot"
    data-card-id={leaderCard?.cardId}
    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2"
  >
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {t('admin.decks.editor.leaderTitle')}
      </p>
      {leaderCard ? (
        <button
          type="button"
          onClick={onClearLeader}
          data-testid="deck-admin-leader-clear"
          aria-label={translateKey(t, 'admin.decks.cards.removeAllOf', { name: leaderName ?? leaderCard.cardId })}
          className="rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
        >
          {t('admin.decks.cards.clear')}
        </button>
      ) : null}
    </div>

    {leaderCard ? (
      <div className="mt-1 flex items-center gap-2">
        <div className="h-14 w-10 shrink-0 overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface)]">
          {leaderCard.metadata ? (
            <CardImage
              card={leaderCard.metadata}
              variant="board"
              alt={leaderName ?? leaderCard.cardId}
              loading="lazy"
              decoding="async"
              className={CARD_ART_IMAGE_CLASS}
              fallbackLabel={leaderName ?? leaderCard.cardId}
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <p
            data-testid="deck-admin-leader-name"
            className="line-clamp-1 text-sm font-semibold text-[var(--text-primary)]"
          >
            {leaderName}
          </p>
          <p className="text-[11px] text-[var(--text-secondary)]">
            {leaderCard.metadata ? leaderCard.metadata.id : leaderCard.cardId}
            {leaderDetail ? ` · ${leaderDetail}` : ''}
            {' · ×1'}
          </p>
        </div>
      </div>
    ) : (
      <p className="mt-1 text-xs text-[var(--text-secondary)]">
        {t('admin.decks.editor.leaderEmpty')}
      </p>
    )}

    <p className="mt-2 text-[11px] text-[var(--text-secondary)]">
      {t('admin.decks.editor.totalCopies', { count: totalCopies })}
    </p>
  </div>
}