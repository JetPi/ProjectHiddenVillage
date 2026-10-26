import { api } from '@/services/api/httpClient'
import type { IPresenceSnapshot } from '@/types/presence'

/**
 * The number before the presence socket is up, and the fallback when it never connects. Anonymous on the server
 * side, so this works for a visitor who has not typed a name yet.
 */
export async function fetchPresence(): Promise<IPresenceSnapshot> {
  const { data } = await api.get<IPresenceSnapshot>('/api/presence')
  return data
}
