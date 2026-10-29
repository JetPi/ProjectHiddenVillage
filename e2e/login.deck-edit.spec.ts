import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { createAdminSession } from './helpers/adminSession'

const AUTH_SESSION_KEY = 'phv-auth-session'
const DECK_OPTIONS = 'Deck Options'
const SAVED_DECKS = 'Saved Decks'
const IMPORT = 'Import'

const EDITED_DECK = {
  id: 'deck-edit-me',
  name: 'Deck One',
  leaderCardId: 'N-001',
  cards: [
    { cardId: 'N-001', quantity: 2 },
    { cardId: 'N-002', quantity: 1 },
  ],
}

/** The import tab's draft text, deliberately different from the deck's own list. */
const IMPORT_DRAFT = '3x N-009'

/**
 * Editing a saved deck reuses the import tab as an overwrite: the deck's own list is loaded into it, the dialog says
 * it will overwrite, "Use" is not offered, and cancelling gives the player's import draft back untouched. The save
 * path itself, including the leader-only record reset, is covered by the server tests.
 */
test.describe('deck editing', () => {
  test.describe.configure({ timeout: 90_000 })

  test('the Edit action opens the import tab loaded with the deck and gives the draft back on cancel', async ({ page, request }) => {
    await seedSession(page, request)
    await mockDecks(page)

    await page.goto('/')
    await expect(page.locator('#displayName')).toBeVisible({ timeout: 30_000 })

    // A draft of the player's own, which the edit must not consume.
    await page.getByRole('radio', { name: IMPORT }).click()
    await expect(page.locator('#deckImportPayload')).toBeVisible()
    await page.locator('#deckImportPayload').fill(IMPORT_DRAFT)
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.locator('#deckImportPayload')).toBeHidden()

    await page.getByRole('radio', { name: SAVED_DECKS }).click()
    const options = await openSavedDeckOptions(page)
    await options.filter({ hasText: EDITED_DECK.name }).click()

    await openSavedDeckOptions(page)
    await page
      .getByRole('listbox')
      .getByRole('button', { name: `Edit ${EDITED_DECK.name}` })
      .click()

    await expect(page.locator('#deckImportPayload')).toHaveValue('2x N-001\n1x N-002')
    await expect(page.locator('#importDeckName')).toHaveValue(EDITED_DECK.name)
    await expect(page.getByRole('heading', { name: `Edit ${EDITED_DECK.name}` })).toBeVisible()
    await expect(page.getByTestId('import-deck-save')).toHaveText('Overwrite deck')
    await expect(page.getByTestId('import-deck-use')).toHaveCount(0)

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.locator('#deckImportPayload')).toBeHidden()

    // Back on the deck list it came from, with the same deck still selected.
    await expect(page.getByRole('radio', { name: SAVED_DECKS })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('combobox', { name: DECK_OPTIONS })).toContainText(EDITED_DECK.name)

    // And the import tab still holds the draft the edit borrowed.
    await page.getByRole('radio', { name: IMPORT }).click()
    await expect(page.locator('#deckImportPayload')).toHaveValue(IMPORT_DRAFT)
  })
})

async function seedSession(page: Page, request: APIRequestContext): Promise<void> {
  const session = await createAdminSession(request)

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value)
    },
    { key: AUTH_SESSION_KEY, value: JSON.stringify({ ...session, isGuest: false }) },
  )
}

async function mockDecks(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/deck',
    async (route) => {
      const isPlayerList = new URL(route.request().url()).searchParams.has('userId')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          isPlayerList
            ? [{
              ...EDITED_DECK,
              type: 'User',
              userId: null,
              leaderColor: 'Red',
              record: { wins: 4, losses: 1, draws: 0 },
            }]
            : [],
        ),
      })
    },
  )
}

/** Opens the picker once the mocked saved deck has arrived. */
async function openSavedDeckOptions(page: Page) {
  const combobox = page.getByRole('combobox', { name: DECK_OPTIONS })

  await expect.poll(async () => {
    await combobox.click()
    const count = await page.getByRole('listbox').getByRole('option').count()
    await page.keyboard.press('Escape')

    return count
  }, {
    timeout: 30_000,
  }).toBeGreaterThan(0)

  await combobox.click()
  return page.getByRole('listbox').getByRole('option')
}
