import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const AUTH_STORAGE_KEY = 'phv-auth-session'
const API_HOST = '127.0.0.1:3101'
/** Seeded development admin (`DevelopmentUserSeeder.SeedUserOneId`, IsCardCatalogAdmin: true). */
const ADMIN_USER_ID = '20000000-0000-0000-0000-000000000001'

const adminSession = {
  userId: ADMIN_USER_ID,
  username: 'test-user-1',
  email: 'test-user-1@hiddenvillage.local',
  accessToken: 'dev-bypass-token',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
}

/**
 * Authoring a card is the one admin flow that cannot be tested against the seed data: it has to pick an image,
 * upload it, and then create the row that points at it. Two things are worth pinning here - that a rejected
 * upload reports itself instead of failing silently, and that the card created from an upload resolves its art
 * through the anonymous card-art endpoint afterwards.
 *
 * Note what is deliberately *not* asserted: that an unauthenticated caller is refused. The development
 * authentication bypass grants `card_catalog_admin` to every request it sees (see
 * `DevelopmentAuthenticationHandler`), so in this environment there is no unauthenticated caller to test with.
 */
test('admin can create a card with an uploaded image and see it in the catalogue', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })

  await context.route('**/*', (route) => {
    if (route.request().url().includes(API_HOST)) {
      return route.continue({
        headers: { ...route.request().headers(), 'X-Dev-User-Id': ADMIN_USER_ID },
      })
    }

    return route.continue()
  })
  await context.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session))
    },
    { key: AUTH_STORAGE_KEY, session: adminSession },
  )

  const page = await context.newPage()

  await page.goto('/admin/cards')

  // The dotnet API (migrations + seeding) comes up after the Vite dev server Playwright pings, so retry until
  // the catalogue loads instead of asserting on the first fetch.
  let tileCount = 0
  for (let attempt = 0; attempt < 20 && tileCount === 0; attempt += 1) {
    await page.waitForTimeout(3000)
    tileCount = await page.locator('li button').count()
    if (tileCount === 0) {
      await page.reload()
    }
  }
  expect(tileCount, 'card list never loaded (API not reachable)').toBeGreaterThan(0)

  // A card id nothing else owns, so a rerun of this spec does not collide with the previous run's card.
  const cardId = `E2E-CREATE-${Date.now()}`
  const displayName = `E2E Created ${cardId}`

  await page.getByTestId('admin-add-card').click()
  await expect(page).toHaveURL(/\/admin\/cards\/new$/)

  // 1. A file the server cannot use has to report why, rather than looking like a no-op.
  // A real file from the repo, so the rejection is exercised against bytes the server has to inspect rather
  // than a synthetic string.
  const nonImageBytes = readFileSync(resolve(process.cwd(), 'playwright.config.ts'))
  await page.setInputFiles('#card-admin-art-file', {
    name: 'playwright.config.ts',
    mimeType: 'text/plain',
    buffer: nonImageBytes,
  })
  await expect(page.getByText(/not supported/)).toBeVisible({ timeout: 15_000 })

  await page.locator('#card-admin-create-card-id').fill(cardId)
  await page.locator('#card-admin-create-display-name').fill(displayName)

  // 2. A real PNG, screenshotted from the page so the test does not carry an image fixture around.
  const pngBytes = await page.screenshot({ clip: { x: 0, y: 0, width: 8, height: 8 } })
  await page.setInputFiles('#card-admin-art-file', {
    name: `${cardId}.png`,
    mimeType: 'image/png',
    buffer: pngBytes,
  })
  await expect(page.getByText(/Image uploaded/)).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Create Card' }).click()

  // 3. Creating lands back on the catalogue, filtered to the card just made, so it is the card on screen.
  await expect(page).toHaveURL(/\/admin\/cards$/, { timeout: 20_000 })
  await expect(page.getByText(/Card created/).first()).toBeVisible({ timeout: 20_000 })

  const createdTile = page.locator('li button', { hasText: cardId }).first()
  await expect(createdTile, 'the created card should be in the catalogue').toBeVisible({ timeout: 20_000 })

  // 4. The stored master resolves through the anonymous card-art endpoint, which is what actually proves the
  //    create request's `local:` reference points at the upload.
  const artResponse = await page.request.get(`http://${API_HOST}/api/card-art/${cardId}?w=240`)
  expect(artResponse.status(), `card art for ${cardId} did not resolve`).toBe(200)
  expect(artResponse.headers()['content-type']).toContain('image/webp')

  await context.close()
})
