import { CardImage } from '@/components/ui/cards'
import type { ICardAdminCardTileProps } from '@/views/admin/types/cardAdminCardTile'
import { CARD_ART_IMAGE_CLASS } from '@/components/ui/cards'

export function CardAdminCardTile({ card, isSelected, onSelect }: ICardAdminCardTileProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(card.id)}
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
  )
}
