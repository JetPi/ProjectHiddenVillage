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

/** How often a creator parked on the share dialog checks whether the second seat has been taken. */
const CREATED_GAME_OPPONENT_POLL_INTERVAL_MS = 2_000

export function hasSecondPlayer(state: IGameStateResponse | undefined): boolean {
  return (state?.players.length ?? 0) >= 2
}

/**
 * Watches a just-created game for its second player while the creator is still on the login view sharing the code.
 * The board is not mounted yet, so there is no hub subscription here on purpose: `SubscribeToGame` also registers the
 * connection as a watcher, and a login page must never count as one - the phase presentations wait on watchers to
 * acknowledge. A short poll answers the only question the dialog has: has someone sat down?
 */
export function useGameOpponentJoinedQuery(joinCode: string | undefined) {
  // Only the cache key folds case (see `gameStateQueryKeys.byCode`). The request must not: the server keys game
  // codes with `StringComparer.Ordinal` and only trims them before the lookup, while generated codes are upper case,
  // so a lowercased request answers "Game.NotFound" for a game that exists. Ask for exactly the code we were given.
  const requestedCode = joinCode?.trim() ?? ''

  return useQuery<IGameStateResponse>({
    queryKey: gameStateQueryKeys.byCode(requestedCode),
    queryFn: () => fetchGameState(requestedCode),
    enabled: requestedCode.length > 0,
    staleTime: 0,
    // A couple of retries absorb a blip without leaving the creator staring at a wait that has already died.
    retry: 2,
    // One request every two seconds is cheap, and the creator waiting for a friend is exactly the person whose tab
    // is in the background: pausing there would hide the hand-over until they came back to look.
    refetchInterval: (query) =>
      hasSecondPlayer(query.state.data) ? false : CREATED_GAME_OPPONENT_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
  })
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
