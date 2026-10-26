import { api } from '@/services/api/httpClient'
import type { IAuthSession } from '@/state/authSession'

type IGuestSessionApiResponse = {
  id: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
}

/**
 * Mints a throwaway identity from a display name. The server returns the same shape as a login, so the rest
 * of the app can treat a guest exactly like a signed-in player, minus everything that persists.
 */
export async function createGuestSession(displayName: string): Promise<IAuthSession> {
  const { data } = await api.post<IGuestSessionApiResponse>('/api/user/guest', { displayName })

  return {
    userId: data.id,
    username: data.username,
    email: data.email,
    accessToken: data.accessToken,
    expiresAt: data.expiresAt,
    isGuest: true,
  }
}
