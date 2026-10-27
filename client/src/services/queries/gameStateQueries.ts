import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchGameRuleset, fetchGameState } from '@/services/api/gameApi'
import type { IGameRulesetBindingResponse, IGameStateResponse } from '@/services/api/types/game'

export const DEFAULT_GAME_STATE_STALE_TIME_MS = 15_000

export const gameStateQueryKeys = {
  all: ['game-state'] as const,
  byCode: (joinCode: string) => ['game-state', joinCode.trim().toLowerCase()] as const,
}

export const gameRulesetQueryKeys = {
  all: ['game-ruleset'] as const,
  byCode: (joinCode: string) => ['game-ruleset', joinCode.trim().toLowerCase()] as const,
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

/** Typing a five-character code should cost one lookup, not five. */
const GAME_RULESET_LOOKUP_DEBOUNCE_MS = 250

export type IGameRulesetLookup = {
  /** The format of the game behind the code, or null while it is unknown or the game has none. */
  ruleset: IGameRulesetBindingResponse | null
  /** True while the code is still settling or its answer is on its way. */
  isChecking: boolean
}

/**
 * The format of the game a player is typing a code for, so their deck can be judged before they ask to join.
 *
 * The code is debounced, but the answer is only reported for the code currently in the field: a stale format must
 * never judge a deck the player is about to bring to a different table. An unbound game and an unknown code both
 * answer null, which reads as "nothing to check here".
 */
export function useGameRulesetByCodeQuery(joinCode: string | undefined): IGameRulesetLookup {
  const requestedCode = joinCode?.trim() ?? ''
  const [settledCode, setSettledCode] = useState('')

  useEffect(() => {
    // Clearing settles immediately; typing waits for the code to stop changing. Both go through the timer so the
    // effect never sets state in its own body.
    const delayMs = requestedCode ? GAME_RULESET_LOOKUP_DEBOUNCE_MS : 0
    const timer = window.setTimeout(() => setSettledCode(requestedCode), delayMs)

    return () => window.clearTimeout(timer)
  }, [requestedCode])

  // As with the state reads, the request must carry the code exactly as typed: the server keys codes ordinally.
  const query = useQuery<IGameRulesetBindingResponse | null>({
    queryKey: gameRulesetQueryKeys.byCode(settledCode),
    queryFn: () => fetchGameRuleset(settledCode),
    enabled: settledCode.length > 0,
    // A game's format is fixed when it is minted, so one answer per code is final.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    // A 404 already answers null, so a retry only asks the same question again.
    retry: 1,
  })

  const isCurrentCode = settledCode === requestedCode
  const hasAnswer = query.isSuccess && !query.isFetching

  return {
    ruleset: isCurrentCode && query.data ? query.data : null,
    isChecking: requestedCode.length > 0 && (!isCurrentCode || !hasAnswer),
  }
}
