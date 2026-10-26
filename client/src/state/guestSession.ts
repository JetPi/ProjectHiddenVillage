import { createGuestSession } from '@/services/api/guestSessionApi'
import { persistAuthSession, readAuthSession } from '@/state/authSession'
import type { IAuthSession } from '@/state/authSession'

/**
 * Returns the identity to play with, minting a guest session when there is none.
 *
 * A registered session is always reused as-is. A guest session is reused while the display name still matches
 * the one it was minted with; renaming simply mints a fresh identity, which is safe precisely because a guest
 * owns nothing durable - the abandoned row ages out of the retention window on its own.
 *
 * Minting a guest deliberately publishes no auth notice: nobody logged in, and the action that needed the
 * identity (creating or joining a game, queueing for a match) toasts for itself.
 */
export async function ensurePlayerIdentity(displayName: string): Promise<IAuthSession> {
  const normalizedDisplayName = displayName.trim()
  if (!normalizedDisplayName) {
    throw new Error('A display name is required to play.')
  }

  const currentSession = readAuthSession()
  if (currentSession && !currentSession.isGuest) {
    return currentSession
  }

  if (currentSession?.isGuest && currentSession.username === normalizedDisplayName) {
    return currentSession
  }

  const guestSession = await createGuestSession(normalizedDisplayName)
  persistAuthSession(guestSession)

  return guestSession
}
