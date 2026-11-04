import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { createAdminSession } from './helpers/adminSession'
import { API_BASE_URL, login } from './helpers/multiplayer/api'
import type { AuthSession } from './helpers/multiplayer/types'

const AUTH_STORAGE_KEY = 'phv-auth-session'

/** Every admin URL the app serves. A guard that covers four of these is a guard that does not cover the fifth. */
const ADMIN_PATHS = [
  '/admin/cards',
  '/admin/cards/new',
  '/admin/decks',
  '/admin/decks/00000000-0000-0000-0000-000000000000',
  '/admin/rulesets',
] as const

/** A test id that only exists inside an admin screen, used to prove nothing rendered. */
const ADMIN_UI_TEST_ID = 'admin-add-card'

const DENIED_MESSAGE = 'Sign in with an administrator account to open that page.'
const NOT_FOUND_TITLE = 'Page Not Found'

const NON_ADMIN_EMAIL = 'test-user-2@hiddenvillage.local'
const NON_ADMIN_PASSWORD = 'TestUser2!'

async function seedSession(page: Page, session: AuthSession): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value)
    },
    { key: AUTH_STORAGE_KEY, value: JSON.stringify(session) },
  )
}

/** A real guest identity, minted the way the login view mints one, so the guest claim is genuinely in the token. */
async function createGuestSession(request: APIRequestContext): Promise<AuthSession> {
  const response = await request.post(`${API_BASE_URL}/api/user/guest`, {
    data: { displayName: 'Route Guard Guest' },
  })
  expect(response.ok(), `Guest session failed with ${response.status()}`).toBeTruthy()

  const payload = (await response.json()) as {
    id: string
    username: string
    email: string
    accessToken: string
    expiresAt: string
    isCardCatalogAdmin: boolean
  }

  return {
    userId: payload.id,
    username: payload.username,
    email: payload.email,
    accessToken: payload.accessToken,
    expiresAt: payload.expiresAt,
    isGuest: true,
    isCardCatalogAdmin: payload.isCardCatalogAdmin,
  }
}

async function createNonAdminSession(request: APIRequestContext): Promise<AuthSession> {
  const response = await login(request, NON_ADMIN_EMAIL, NON_ADMIN_PASSWORD)

  return {
    userId: response.id,
    username: response.username,
    email: response.email,
    accessToken: response.accessToken,
    expiresAt: response.expiresAt,
    isGuest: false,
    isCardCatalogAdmin: response.isCardCatalogAdmin,
  }
}

/**
 * These are the screens that author the catalogue, the decks and the formats. They were reachable by URL with no
 * session at all, because nothing in the route tree looked at one; the parent `/admin` loader is what closes that.
 * The assertions below walk every admin URL rather than one, since the hole was per-route and a new route added
 * without the parent would reopen it.
 */
test('anonymous visitors are sent to the login panel from every admin route', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  for (const path of ADMIN_PATHS) {
    await page.goto(path)

    await expect(page, `${path} must not render for an anonymous visitor`).toHaveURL(
      /^http:\/\/127\.0\.0\.1:4173\/(\?.*)?$/,
    )
    await expect(page.getByTestId(ADMIN_UI_TEST_ID)).toHaveCount(0)
  }

  await context.close()
})

test('the redirect leaves a notice explaining why the admin page did not open', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/admin/cards')

  await expect(page.getByText(DENIED_MESSAGE)).toBeVisible()

  await context.close()
})

test('a guest session gets the ordinary not-found page instead of an admin screen', async ({ browser, request }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const guestSession = await createGuestSession(request)
  await seedSession(page, guestSession)

  for (const path of ADMIN_PATHS) {
    await page.goto(path)

    await expect(page, `${path} must not render for a guest`).toHaveURL(new RegExp(`${path.replace(/[/]/g, '\\/')}$`))
    await expect(page.getByRole('heading', { name: NOT_FOUND_TITLE })).toBeVisible()
    await expect(page.getByTestId(ADMIN_UI_TEST_ID)).toHaveCount(0)
  }

  await context.close()
})

test('a signed-in non-admin gets the ordinary not-found page instead of an admin screen', async ({ browser, request }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await seedSession(page, await createNonAdminSession(request))

  for (const path of ADMIN_PATHS) {
    await page.goto(path)

    await expect(page.getByRole('heading', { name: NOT_FOUND_TITLE })).toBeVisible()
    await expect(page.getByTestId(ADMIN_UI_TEST_ID)).toHaveCount(0)
  }

  await context.close()
})

test('a tampered stored flag cannot open an admin screen', async ({ browser, request }) => {
  // The guard asks the server, so a hand-edited localStorage value buys nothing - which is the whole reason the
  // flag is not trusted. `isCardCatalogAdmin: true` here is a lie the browser was able to write.
  const context = await browser.newContext()
  const page = await context.newPage()
  const nonAdminSession = await createNonAdminSession(request)
  await seedSession(page, { ...nonAdminSession, isCardCatalogAdmin: true })

  await page.goto('/admin/cards')

  await expect(page.getByRole('heading', { name: NOT_FOUND_TITLE })).toBeVisible()
  await expect(page.getByTestId(ADMIN_UI_TEST_ID)).toHaveCount(0)

  await context.close()
})

test('an admin session still reaches every admin screen', async ({ browser, request }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await seedSession(page, await createAdminSession(request))

  await page.goto('/admin/cards')
  await expect(page.getByTestId(ADMIN_UI_TEST_ID)).toBeVisible()

  await page.goto('/admin/decks')
  await expect(page.getByTestId('admin-deck-new')).toBeVisible()

  await page.goto('/admin/rulesets')
  await expect(page.getByTestId('admin-ruleset-rail')).toBeVisible()

  await context.close()
})
