export type IPagedResponse<TItem> = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  items: TItem[]
}

export type ICardCatalogConditionResponse = {
  id: string
  args: Record<string, string>
}

export type ICardCatalogEffectResponse = {
  id: string
  kind: string
  timing: string
  args: Record<string, string>
}

export type ICardCatalogItemResponse = {
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
  conditions: ICardCatalogConditionResponse[]
  effects: ICardCatalogEffectResponse[]
  life: number | null
  health: number | null
  supportName: string | null
  supportEffect: string | null
  supportCost: number | null
}
