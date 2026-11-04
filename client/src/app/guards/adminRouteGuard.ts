import axios from 'axios'
import { redirect } from 'react-router-dom'
import i18n from '@/i18n'
import { markAdminSignInNotice } from '@/app/guards/adminGuardNotice'
import { fetchCurrentUser } from '@/services/api/userApi'
import { clearAuthSession, readAuthSession } from '@/state/authSession'

/**
 * Sends a visitor with no usable session back to the login panel, which is the only place a session can be acquired.
 * The redirect is thrown rather than returned because a loader's return value is data, not a response.
 *
 * The notice is left as a flag instead of a toast: `RouteTransitionOverlay` turns it into one after the redirect,
 * when the toaster is actually on screen and the navigation is no longer in flight.
 */
function denyAnonymous(): never {
  markAdminSignInNotice()

  throw redirect('/')
}

/**
 * Asks the server whether the stored token belongs to an administrator.
 *
 * The `isCardCatalogAdmin` flag kept with the session is deliberately not used here: it lives in localStorage, so
 * the browser can rewrite it. Only this answer decides whether an admin screen may render.
 */
async function resolveAdminCapability(): Promise<boolean> {
  try {
    const currentUser = await fetchCurrentUser()
    return currentUser.isCardCatalogAdmin
  } catch (error) {
    // A rejected or vanished identity (expired token, deleted row) leaves nothing worth keeping.
    if (axios.isAxiosError(error) && [401, 404].includes(error.response?.status ?? 0)) {
      clearAuthSession()
      denyAnonymous()
    }

    // An outage is not a permission slip: fail closed and let the route error boundary explain the 503.
    throw new Response(i18n.t('admin.guard.verificationFailed'), {
      status: 503,
      statusText: 'Admin verification unavailable',
    })
  }
}

/**
 * The one gate in front of every admin screen.
 *
 * It hangs off the `/admin` parent route, so `cards`, `cards/new`, `decks`, `decks/:deckId`, `rulesets` - and any
 * screen added later - inherit it without repeating a line. Children cannot render while this loader is rejecting.
 *
 * No session, or a token the server rejects, means the login panel. A verified non-admin gets the ordinary 404 page,
 * so the admin URLs do not advertise that they exist.
 */
export async function adminRouteGuard(): Promise<null> {
  const session = readAuthSession()

  if (!session) {
    denyAnonymous()
  }

  const isCardCatalogAdmin = await resolveAdminCapability()

  if (!isCardCatalogAdmin) {
    throw new Response(null, { status: 404, statusText: 'Not Found' })
  }

  return null
}
