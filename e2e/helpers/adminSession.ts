import type { APIRequestContext } from '@playwright/test'
import { login } from './multiplayer/api'
import type { AuthSession } from './multiplayer/types'

/** The seeded development admin (`DevelopmentUserSeeder`), which carries the `card_catalog_admin` claim. */
const SEEDED_ADMIN_EMAIL = 'test-user-1@hiddenvillage.local'
const SEEDED_ADMIN_PASSWORD = 'TestUser1!'

/**
 * A real session for the seeded admin, obtained the way a browser obtains one.
 *
 * A *fabricated* `accessToken` does not work in this app, and the failure is confusing: the authentication policy
 * forwards any request carrying `Authorization: Bearer …` to the JWT handler, and a token that does not validate
 * fails the request with 401 - the development bypass never gets a say. Anonymous reads keep working, so the admin
 * screens look fine until the first authorised write (the art upload), which answers 401 for no visible reason.
 *
 * `AuthTokenService` puts the `card_catalog_admin` claim in the token of an admin user, so logging in makes every
 * call travel the same path it would in production.
 */
export async function createAdminSession(request: APIRequestContext): Promise<AuthSession> {
  const response = await login(request, SEEDED_ADMIN_EMAIL, SEEDED_ADMIN_PASSWORD)

  return {
    userId: response.id,
    username: response.username,
    email: response.email,
    accessToken: response.accessToken,
    expiresAt: response.expiresAt,
  }
}
