import { useQuery } from '@tanstack/react-query'
import { fetchGameState } from '@/services/api/gameApi'
import type { IGameStateResponse } from '@/services/api/types/game'

export const DEFAULT_GAME_STATE_STALE_TIME_MS = 15_000

export const gameStateQueryKeys = {
  all: ['game-state'] as const,
  byCode: (joinCode: string) => ['game-state', joinCode.trim().toLowerCase()] as const,
}

export type IUseGameStateQueryOptions = {
  enabled?: boolean
  staleTimeMs?: number
}

export function useGameStateQuery(joinCode: string | undefined, options: IUseGameStateQueryOptions = {}) {
  const normalizedJoinCode = joinCode?.trim().toLowerCase() ?? ''

  return useQuery<IGameStateResponse>({
    queryKey: gameStateQueryKeys.byCode(normalizedJoinCode),
    queryFn: () => fetchGameState(normalizedJoinCode),
    enabled: (options.enabled ?? true) && normalizedJoinCode.length > 0,
    staleTime: options.staleTimeMs ?? DEFAULT_GAME_STATE_STALE_TIME_MS,
  })
}
