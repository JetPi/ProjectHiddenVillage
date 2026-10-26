import { api } from '@/services/api/httpClient'
import type { IEnqueueMatchRequest, IMatchTicket } from '@/types/matchmaking'

export async function enqueueMatch(request: IEnqueueMatchRequest): Promise<IMatchTicket> {
  const { data } = await api.post<IMatchTicket>('/api/matchmaking/queue', request)
  return data
}

export async function fetchMatchTicket(ticketId: string): Promise<IMatchTicket> {
  const { data } = await api.get<IMatchTicket>(
    `/api/matchmaking/queue/${encodeURIComponent(ticketId)}`,
  )

  return data
}

export async function cancelMatchTicket(ticketId: string): Promise<IMatchTicket> {
  const { data } = await api.delete<IMatchTicket>(
    `/api/matchmaking/queue/${encodeURIComponent(ticketId)}`,
  )

  return data
}
