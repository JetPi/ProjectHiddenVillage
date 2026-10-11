import { CardAdminCardTile } from './CardAdminCardTile'
import type { ICardAdminCardGridProps } from '@/views/admin/types/cardAdminViewTypes'

export function CardAdminCardGrid({ cards, selectedCardId, onSelectCard }: ICardAdminCardGridProps) {
  return (
    <ul className="grid gap-3 p-3 grid-cols-3">
      {cards.map((card) => {
        const isSelected = card.id === selectedCardId

        return (
          <li key={card.id}>
            <CardAdminCardTile card={card} isSelected={isSelected} onSelect={onSelectCard} />
          </li>
        )
      })}
    </ul>
  )
}
