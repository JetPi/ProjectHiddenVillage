import { CardAdminCardTile } from './CardAdminCardTile'
import type { ICardAdminCardGridProps } from '@/views/admin/types/cardAdminCardGrid'

export function CardAdminCardGrid({ cards, selectedCardId, onSelectCard }: ICardAdminCardGridProps) {
  return (
    <ul className="grid gap-3 p-3 [grid-template-columns:repeat(auto-fit,minmax(10.5rem,1fr))]">
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
