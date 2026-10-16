import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
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
 * Pastes PNG bytes into the art source dialog the way a browser would: a real `ClipboardEvent` carrying a
 * `DataTransfer` that holds one `File`. `page.keyboard` cannot put an image on the clipboard, so the event is
 * dispatched by hand - and it has to *bubble*, because React listens at the root container, not on the element.
 */
async function pasteImage(page: Page, base64Png: string, fileName: string): Promise<void> {
  await page.evaluate(
    ({ bytes, name }) => {
      const binary = Uint8Array.from(atob(bytes), (character) => character.charCodeAt(0))
      const file = new File([binary], name, { type: 'image/png' })
      const transfer = new DataTransfer()
      transfer.items.add(file)

      document
        .querySelector('#card-admin-art-paste')
        ?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }))
    },
    { bytes: base64Png, name: fileName },
  )
}

/**
 * Authoring a card is the one admin flow that cannot be tested against the seed data: it has to supply an image,
 * upload it, and then create the row that points at it.
 *
 * What is pinned here: the source dialog refuses what would be stored broken or soft *before* any request - a file
 * that is not an image at all, and a bitmap narrower than the stored master width - and a pasted image that is big
 * enough is uploaded, created, and resolves through the anonymous card-art endpoint afterwards.
 *
 * Note what is deliberately *not* asserted: that an unauthenticated caller is refused. The development
 * authentication bypass grants `card_catalog_admin` to every request it sees (see
 * `DevelopmentAuthenticationHandler`), so in this environment there is no unauthenticated caller to test with.
 */
test('admin can create a card from a pasted image and see it in the catalogue', async ({ browser }) => {
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

  // The card id comes first on purpose: an upload names the id it is stored under.
  await page.locator('#card-admin-create-card-id').fill(cardId)
  await page.locator('#card-admin-create-display-name').fill(displayName)

  await page.getByTestId('admin-art-source-open').click()

  // 1. Bytes that are not an image are refused by the dialog itself, so no upload is ever attempted.
  // A real file from the repo, so the refusal is exercised against bytes nothing can decode.
  const nonImageBytes = readFileSync(resolve(process.cwd(), 'playwright.config.ts'))
  await page.setInputFiles('#card-admin-art-file', {
    name: 'playwright.config.ts',
    mimeType: 'text/plain',
    buffer: nonImageBytes,
  })
  await expect(page.getByText(/could not be decoded as an image/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('admin-art-source-confirm')).toBeDisabled()

  // 2. A bitmap narrower than the width a master is written at would be stored soft, so it is refused too. This is
  //    the case a paste makes easy to hit by accident - a thumbnail copied out of a gallery page.
  const tinyPngBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 8
    canvas.height = 8
    canvas.getContext('2d')?.fillRect(0, 0, 8, 8)

    return canvas.toDataURL('image/png').split(',')[1]
  })
  await pasteImage(page, tinyPngBase64, 'tiny.png')
  await expect(page.getByText(/at least 600 px wide/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('admin-art-source-confirm')).toBeDisabled()

  // 3. A real PNG, screenshotted from the page so the test does not carry an image fixture around, pasted through
  //    the same clipboard path an author would use. 800 px wide clears the gate.
  const pngBase64 = (await page.screenshot({ clip: { x: 0, y: 0, width: 800, height: 800 } })).toString('base64')
  await pasteImage(page, pngBase64, `${cardId}.png`)
  await expect(page.getByText(/800 × 800 px/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('admin-art-source-confirm')).toBeEnabled()
  await page.getByTestId('admin-art-source-confirm').click()

  await expect(page.getByText(/Image uploaded/)).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Create Card' }).click()

  // 4. Creating lands back on the catalogue, filtered to the card just made, so it is the card on screen.
  await expect(page).toHaveURL(/\/admin\/cards$/, { timeout: 20_000 })
  await expect(page.getByText(/Card created/).first()).toBeVisible({ timeout: 20_000 })

  const createdTile = page.locator('li button', { hasText: cardId }).first()
  await expect(createdTile, 'the created card should be in the catalogue').toBeVisible({ timeout: 20_000 })

  // 5. The stored master resolves through the anonymous card-art endpoint, which is what actually proves the
  //    create request's `local:` reference points at the upload.
  const artResponse = await page.request.get(`http://${API_HOST}/api/card-art/${cardId}?w=240`)
  expect(artResponse.status(), `card art for ${cardId} did not resolve`).toBe(200)
  expect(artResponse.headers()['content-type']).toContain('image/webp')

  await context.close()
})
