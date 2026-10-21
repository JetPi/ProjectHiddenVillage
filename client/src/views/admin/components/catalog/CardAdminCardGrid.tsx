import { CardAdminCardTile } from './CardAdminCardTile'
import type { ICardAdminCardGridProps } from '@/views/admin/types/cardAdminViewTypes'

export function CardAdminCardGrid({
  cards,
  selectedCardId,
  onSelectCard,
  selectedCountByCardId,
  maxCopies,
  onAddCard,
  onRemoveCard,
}: ICardAdminCardGridProps) {
  return (
    <ul className="grid gap-3 p-3 grid-cols-3">
      {cards.map((card) => {
        const isSelected = card.id === selectedCardId
        const normalizedCardId = card.id.trim().toLowerCase()

        return (
          <li key={card.id}>
            <CardAdminCardTile
              card={card}
              isSelected={isSelected}
              onSelect={onSelectCard}
              selectedCount={selectedCountByCardId?.get(normalizedCardId)}
              maxCopies={maxCopies}
              onAdd={onAddCard}
              onRemove={onRemoveCard}
            />
          </li>
        )
      })}
    </ul>
  )
}
