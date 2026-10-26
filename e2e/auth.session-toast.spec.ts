import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

/**
 * Auth toasts are events, not a reaction to "a session exists". This spec pins that distinction: the toast shows
 * once when a login request succeeds, and a reload that merely restores the stored session shows nothing.
 *
 * The network is mocked so the spec neither writes users into the shared e2e database nor depends on the seeded
 * accounts. The presence socket is refused for the same reason the quick-match spec does it: a live snapshot would
 * push unrelated updates into the page while the toast assertions run.
 */

const PLAYER = {
  id: '22222222-2222-2222-2222-222222222222',
  username: 'E2E Player',
  email: 'e2e-player@example.com',
}

function sessionPayload() {
  return {
    ...PLAYER,
    accessToken: 'e2e-access-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function mockAuthNetwork(page: Page): Promise<{ loginRequests: number }> {
  const state = { loginRequests: 0 }

  await page.route(/\/api\/presence$/, (route) =>
    fulfillJson(route, {
      onlineViewers: 1,
      waitingByRuleset: [],
      authenticatedViewers: 0,
      anonymousViewers: 1,
    }),
  )
  await page.route(/\/hubs\/presence(\/.*)?(\?.*)?$/, (route) => route.abort())

  await page.route(/\/api\/deck-rulesets$/, (route) => fulfillJson(route, []))
  await page.route(/\/api\/deck(\?.*)?$/, (route) => fulfillJson(route, []))

  await page.route(/\/api\/user\/login$/, async (route) => {
    state.loginRequests += 1
    await fulfillJson(route, sessionPayload())
  })

  await page.route(/\/api\/user$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await fulfillJson(route, [])
      return
    }

    await fulfillJson(route, PLAYER, 201)
  })

  return state
}

test('a successful login shows the signed-in toast exactly once', async ({ page }) => {
  const network = await mockAuthNetwork(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Open login modal' }).click()
  await page.getByLabel('Email').fill(PLAYER.email)
  await page.getByLabel('Password').fill('e2e-password')
  await page.getByRole('button', { name: 'Log In' }).click()

  await expect(page.getByText(`Logged in as ${PLAYER.username}`, { exact: true })).toHaveCount(1)
  expect(network.loginRequests).toBe(1)
})

test('reloading a restored session does not announce a login again', async ({ page }) => {
  const network = await mockAuthNetwork(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Open login modal' }).click()
  await page.getByLabel('Email').fill(PLAYER.email)
  await page.getByLabel('Password').fill('e2e-password')
  await page.getByRole('button', { name: 'Log In' }).click()
  await expect(page.getByText(`Logged in as ${PLAYER.username}`, { exact: true })).toHaveCount(1)

  const requestsBeforeReload = network.loginRequests
  await page.reload()

  // The session survived the reload, so this is the exact state in which the toast used to reappear.
  await expect(page.locator('#displayName')).toHaveValue(PLAYER.username)
  expect(network.loginRequests).toBe(requestsBeforeReload)

  // The toast effect runs on mount, so its absence shortly after the reload is the assertion that matters.
  await page.waitForTimeout(750)
  await expect(page.getByText(/Logged in as/)).toHaveCount(0)
})

test('sign-up announces once and does not leave a success flag in the URL', async ({ page }) => {
  await mockAuthNetwork(page)

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(PLAYER.email)
  await page.getByLabel('Username').fill(PLAYER.username)
  await page.getByLabel('Password').fill('e2e-password')
  await page.getByRole('button', { name: 'Sign In' }).click()

  await page.waitForURL((url) => url.pathname === '/')
  await expect(page.getByText('Account created successfully.', { exact: true })).toHaveCount(1)
  expect(new URL(page.url()).searchParams.has('signup')).toBe(false)

  await page.reload()
  await expect(page.locator('#displayName')).toHaveValue(PLAYER.username)
  await page.waitForTimeout(750)
  await expect(page.getByText('Account created successfully.')).toHaveCount(0)
})
