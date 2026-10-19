import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createAdminSession } from './helpers/adminSession'
import {
  deleteLegacyAdminCreateCards,
  findAdminCreateCards,
  installAdminCardCreateMocks,
} from './helpers/adminCardMocks'
import type { AuthSession } from './helpers/multiplayer/types'

const AUTH_STORAGE_KEY = 'phv-auth-session'
const API_HOST = '127.0.0.1:3101'

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

async function addToken(page: Page, inputSelector: string, value: string): Promise<void> {
  const input = page.locator(inputSelector)
  await input.fill(value)
  await input.press('Enter')
}

/**
 * Authoring a card is the one admin flow that cannot be tested against the seed data: it has to supply an image,
 * upload it, and then create the row that points at it.
 *
 * The upload and the create write are answered by Playwright routes (`installAdminCardCreateMocks`), so the flow
 * under test is real - paste, client-side image validation, upload, identity chips, create, catalogue search -
 * while the database stays free of `E2E-CREATE-` rows. The initial catalogue read is deliberately left real, so
 * this still proves the screen renders against the seeded catalogue.
 *
 * Note what is deliberately *not* asserted: that an unauthenticated caller is refused. The development
 * authentication bypass grants `card_catalog_admin` to every request it sees (see
 * `DevelopmentAuthenticationHandler`), so in this environment there is no unauthenticated caller to test with.
 */
test.describe('admin card create', () => {
  let adminSession: AuthSession

  test.beforeAll(async ({ request }) => {
    adminSession = await createAdminSession(request)
    // Remove rows written by the pre-mock version of this spec, so a developer database is clean before the run.
    await deleteLegacyAdminCreateCards(request, adminSession.accessToken)
  })

  test.afterAll(async ({ request }) => {
    if (!adminSession) {
      return
    }

    await deleteLegacyAdminCreateCards(request, adminSession.accessToken)
  })

  test('admin can create a card from a pasted image and see it in the catalogue', async ({ browser, request }) => {
    // A card id nothing else owns, so a rerun of this spec does not collide with a legacy row.
    const cardId = `E2E-CREATE-${Date.now()}`
    const displayName = `E2E Created ${cardId}`

    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })

    // A real session: the initial catalogue read and the client's auth header path stay the same as production.
    await context.addInitScript(
      ({ key, session }) => {
        window.localStorage.setItem(key, JSON.stringify(session))
      },
      { key: AUTH_STORAGE_KEY, session: adminSession },
    )

    const page = await context.newPage()
    const mockState = await installAdminCardCreateMocks(page, { cardId, displayName })

    await page.goto('/admin/cards')

    // `globalSetup` has already waited for /api/health, so this is only about the client rendering the
    // catalogue: an auto-retrying assertion instead of 20 x 3 s of sleeping and reloading.
    await expect
      .poll(async () => await page.locator('li button').count(), { timeout: 30_000 })
      .toBeGreaterThan(0)

    await page.getByTestId('admin-add-card').click()
    await expect(page).toHaveURL(/\/admin\/cards\/new$/)

    // 1. The empty-card placeholder has to sit inside its own dotted outline. The fallback SVG carries an
    //    intrinsic 360x500 size, so this pins the overflow that used to leak past the smaller preview box.
    const fallback = page.getByTestId('card-image-fallback').first()
    await expect(fallback).toBeVisible()
    const fallbackGeometry = await fallback.evaluate((element) => {
      const outer = element.getBoundingClientRect()
      const inner = element.querySelector('img')?.getBoundingClientRect() ?? null

      return {
        outer: { left: outer.left, top: outer.top, right: outer.right, bottom: outer.bottom },
        inner: inner
          ? { left: inner.left, top: inner.top, right: inner.right, bottom: inner.bottom }
          : null,
      }
    })
    expect(fallbackGeometry.inner).not.toBeNull()
    const fallbackImage = fallbackGeometry.inner!
    expect(fallbackImage.left, 'placeholder image starts left of its outline').toBeGreaterThanOrEqual(fallbackGeometry.outer.left - 1)
    expect(fallbackImage.top, 'placeholder image starts above its outline').toBeGreaterThanOrEqual(fallbackGeometry.outer.top - 1)
    expect(fallbackImage.right, 'placeholder image overflows the right edge').toBeLessThanOrEqual(fallbackGeometry.outer.right + 1)
    expect(fallbackImage.bottom, 'placeholder image overflows the bottom edge').toBeLessThanOrEqual(fallbackGeometry.outer.bottom + 1)

    // The card id comes first on purpose: an upload names the id it is stored under.
    await page.locator('#card-admin-create-card-id').fill(cardId)
    await page.locator('#card-admin-create-display-name').fill(displayName)

    // 2. Identity lists are committed one entry at a time, and existing catalogue values can be picked from a
    //    dropdown. New values remain allowed, which the typed "Earth" and "Test Trait" below prove.
    await addToken(page, '#card-admin-create-names', 'Naruto Uzumaki')
    await addToken(page, '#card-admin-create-names', 'Naruto')
    await expect(page.getByTestId('admin-identity-name-chip')).toHaveCount(2)

    // Traits use a typeahead: a typo still opens the closest existing trait, and clicking it commits the
    // catalogue's spelling. A value with no match is still accepted by pressing Enter.
    const traitsInput = page.locator('#card-admin-create-traits')
    await traitsInput.fill('Nnja')
    await expect(page.getByTestId('admin-token-suggestions')).toBeVisible()
    await expect(page.getByRole('option', { name: 'Ninja' })).toBeVisible()
    await page.getByRole('option', { name: 'Ninja' }).click()
    await expect(page.getByTestId('admin-identity-trait-chip')).toHaveCount(1)

    await addToken(page, '#card-admin-create-traits', 'Test Trait')
    await expect(page.getByTestId('admin-identity-trait-chip')).toHaveCount(2)

    await page.getByTestId('admin-art-source-open').click()

    // 3. Bytes that are not an image are refused by the dialog itself, so no upload is ever attempted.
    // A real file from the repo, so the refusal is exercised against bytes nothing can decode.
    const nonImageBytes = readFileSync(resolve(process.cwd(), 'playwright.config.ts'))
    await page.setInputFiles('#card-admin-art-file', {
      name: 'playwright.config.ts',
      mimeType: 'text/plain',
      buffer: nonImageBytes,
    })
    await expect(page.getByText(/could not be decoded as an image/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('admin-art-source-confirm')).toBeDisabled()

    // 4. A bitmap narrower than the width a master is written at would be stored soft, so it is refused too. This
    //    is the case a paste makes easy to hit by accident - a thumbnail copied out of a gallery page.
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

    // 5. A real PNG, screenshotted from the page so the test does not carry an image fixture around, pasted through
    //    the same clipboard path an author would use. 800 px wide clears the gate.
    const pngBase64 = (await page.screenshot({ clip: { x: 0, y: 0, width: 800, height: 800 } })).toString('base64')
    await pasteImage(page, pngBase64, `${cardId}.png`)
    await expect(page.getByText(/800 × 800 px/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('admin-art-source-confirm')).toBeEnabled()
    await page.getByTestId('admin-art-source-confirm').click()

    await expect(page.getByText(/Image uploaded/)).toBeVisible({ timeout: 20_000 })
    expect(mockState.uploadRequests, 'the upload should go through the mocked card-art route').toBe(1)

    await page.getByRole('button', { name: 'Create Card' }).click()

    // 6. Creating lands back on the catalogue, filtered to the card just made, so it is the card on screen.
    await expect(page).toHaveURL(/\/admin\/cards$/, { timeout: 20_000 })
    await expect(page.getByText(/Card created/).first()).toBeVisible({ timeout: 20_000 })

    const createdTile = page.locator('li button', { hasText: cardId }).first()
    await expect(createdTile, 'the created card should be in the catalogue').toBeVisible({ timeout: 20_000 })

    // 7. The request carried every identity list and the uploaded reference. This is the assertion that proves
    //    the enter-to-add fields and the suggestion dropdowns feed the create payload correctly.
    expect(mockState.createRequests, 'the create should go through the mocked catalogue route').toBe(1)
    expect(mockState.createPayload).toMatchObject({
      cardId,
      displayName,
      image: `local:${cardId}`,
      name: ['Naruto Uzumaki', 'Naruto'],
      traits: ['Ninja', 'Test Trait'],
    })

    // 8. The stored master resolves through the mocked anonymous card-art endpoint, which is what proves the
    //    create request's `local:` reference points at the upload.
    const artResult = await page.evaluate(async (url) => {
      const response = await fetch(url)

      return {
        status: response.status,
        contentType: response.headers.get('content-type'),
      }
    }, `http://${API_HOST}/api/card-art/${cardId}?w=240`)
    expect(artResult.status, `card art for ${cardId} did not resolve`).toBe(200)
    expect(artResult.contentType).toContain('image/webp')

    // 9. Nothing was written to the real catalogue. This is the guard that keeps the dev/e2e database clean even
    //    if the route mocking above regresses.
    const persistedCardIds = await findAdminCreateCards(request, adminSession.accessToken, cardId)
    expect(persistedCardIds, 'the mocked create must not leave a catalogue row behind').toEqual([])

    await context.close()
  })
})
