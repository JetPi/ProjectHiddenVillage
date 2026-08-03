export type PagedResponse<TItem> = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  items: TItem[]
}

export type CardCatalogConditionResponse = {
  id: string
  args: Record<string, string>
}

export type CardCatalogEffectResponse = {
  id: string
  kind: string
  timing: string
  args: Record<string, string>
}

export type CardCatalogItemResponse = {
  id: string
  image: string
  originalId: string
  mainAlternate: boolean
  attribute: string | null
  name: string[]
  displayName: string
  type: string
  traits: string[]
  color: string
  description: string
  damage: number
  power: number
  conditions: CardCatalogConditionResponse[]
  effects: CardCatalogEffectResponse[]
  life: number | null
  health: number | null
  supportName: string | null
  supportEffect: string | null
  supportCost: number | null
}
