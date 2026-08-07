import { QueryClient } from '@tanstack/react-query'

export const DEFAULT_CARD_CATALOG_STALE_TIME_MS = 120_000

export const appQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_CARD_CATALOG_STALE_TIME_MS,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
