export type ICardCatalogPageQuery = {
  page?: number
  pageSize?: number
  sort?: string
}

export type IUpdateCardCatalogFlagsRequest = {
  cannotBeNormalSummoned: boolean
}
