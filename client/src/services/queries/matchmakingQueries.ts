import { useMutation, useQuery } from '@tanstack/react-query'
import {
  cancelMatchTicket,
  enqueueMatch,
  fetchMatchTicket,
} from '@/services/api/matchmakingApi'
import type { IEnqueueMatchRequest, IMatchTicket } from '@/types/matchmaking'

/** How often a waiting ticket is re-read. Short enough to feel immediate, long enough to be a quiet request. */
export const MATCH_TICKET_POLL_INTERVAL_MS = 1_500

export const matchmakingQueryKeys = {
  all: ['matchmaking'] as const,
  ticket: (ticketId: string) => ['matchmaking', 'ticket', ticketId] as const,
}

export function useEnqueueMatchMutation() {
  return useMutation<IMatchTicket, Error, IEnqueueMatchRequest>({
    mutationFn: (request) => enqueueMatch(request),
  })
}

export function useCancelMatchMutation() {
  return useMutation<IMatchTicket, Error, string>({
    mutationFn: (ticketId) => cancelMatchTicket(ticketId),
  })
}

/**
 * Polls a ticket while it is waiting and stops on its own the moment it settles, so a matched player is sent to
 * the game by the very next read without the caller having to own an interval.
 */
export function useMatchTicketQuery(ticketId: string | null) {
  return useQuery<IMatchTicket>({
    queryKey: matchmakingQueryKeys.ticket(ticketId ?? ''),
    queryFn: () => fetchMatchTicket(ticketId ?? ''),
    enabled: Boolean(ticketId),
    refetchInterval: (query) => {
      const state = query.state.data?.state
      return !state || state === 'waiting' ? MATCH_TICKET_POLL_INTERVAL_MS : false
    },
  })
}
