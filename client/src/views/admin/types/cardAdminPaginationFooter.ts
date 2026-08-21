import type { RefObject } from 'react'

export type ICardAdminPaginationFooterProps = {
  sentinelRef: RefObject<HTMLDivElement | null>
  isFetchingNextPage: boolean
  hasNextPage: boolean
  hasCards: boolean
  onFetchNextPage: () => void | Promise<unknown>
}
