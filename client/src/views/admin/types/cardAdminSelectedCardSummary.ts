import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type ICardAdminSelectedCardSummaryDraft = {
  type: string
  color: string
  power: number
  damage: number
  life: number | null
  health: number | null
}

export type ICardAdminSelectedCardSummaryProps = {
  card: ICardCatalogItemResponse
  draft: ICardAdminSelectedCardSummaryDraft
  onTypeChange: (value: string) => void
  onColorChange: (value: string) => void
  onPowerChange: (value: number) => void
  onDamageChange: (value: number) => void
  onLifeChange: (value: number) => void
  onHealthChange: (value: number) => void
}
