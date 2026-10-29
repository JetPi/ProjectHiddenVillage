import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { createAdminSession } from './helpers/adminSession'

const AUTH_SESSION_KEY = 'phv-auth-session'
const DECK_OPTIONS = 'Deck Options'
const SAVED_DECKS = 'Saved Decks'
const STARTER_DECKS = 'Starter Decks'

const KEPT_DECK = { id: 'deck-kept', name: 'Kept deck' }
const DELETED_DECK = { id: 'deck-deleted', name: 'Doomed deck' }
const PUBLIC_DECK = { id: 'deck-public', name: 'Public deck' }

/**
 * The X on a saved deck is the one destructive control in the picker, so it must (a) only exist on the player's own
 * decks, (b) never select the row it sits on, (c) ask before removing anything, and (d) leave the list and the current
 * selection consistent once the deck is gone.
 *
 * The deck endpoints are mocked so the spec owns the list it deletes from; what is under test is the interaction.
 */
test.describe('deck deletion', () => {
  test.describe.configure({ timeout: 90_000 })

  test('the X only appears on saved decks, confirms, and removes without changing the selection', async ({ page, request }) => {
    await seedSession(page, request)
    await mockDecks(page, { savedDecks: [KEPT_DECK, DELETED_DECK], publicDecks: [PUBLIC_DECK] })
    await mockDeleteDeck(page)

    await page.goto('/')
    await expect(page.locator('#displayName')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('radio', { name: SAVED_DECKS }).click()

    // The kept deck is the selection throughout: deleting its neighbour must not move it.
    await openSavedDeckOptions(page)
    await page.getByRole('listbox').getByRole('option').filter({ hasText: KEPT_DECK.name }).click()
    await expect(page.getByRole('combobox', { name: DECK_OPTIONS })).toContainText(KEPT_DECK.name)

    await openSavedDeckOptions(page)
    // Each saved deck row carries its own edit and delete actions.
    await expect(
      deletionRow(page, KEPT_DECK.name).getByRole('button', { name: `Edit ${KEPT_DECK.name}` }),
    ).toHaveCount(1)
    await expect(
      deletionRow(page, DELETED_DECK.name).getByRole('button', { name: `Delete ${DELETED_DECK.name}` }),
    ).toHaveCount(1)

    await deletionRow(page, DELETED_DECK.name).getByRole('button', { name: `Delete ${DELETED_DECK.name}` }).click()

    const dialog = page.getByTestId('delete-deck-confirm-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(DELETED_DECK.name)

    await page.getByTestId('delete-deck-cancel-button').click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('combobox', { name: DECK_OPTIONS })).toContainText(KEPT_DECK.name)

    await openSavedDeckOptions(page)
    await expect(page.getByRole('listbox').getByRole('option').filter({ hasText: DELETED_DECK.name })).toHaveCount(1)

    await deletionRow(page, DELETED_DECK.name).getByRole('button', { name: `Delete ${DELETED_DECK.name}` }).click()
    await page.getByTestId('delete-deck-confirm-button').click()

    await expect(page.getByTestId('delete-deck-confirm-dialog')).toBeHidden()
    await expect(page.getByRole('combobox', { name: DECK_OPTIONS })).toContainText(KEPT_DECK.name)

    // One deck left, so the list carries exactly one option now.
    await openSavedDeckOptions(page, 1)
    await expect(page.getByRole('listbox').getByRole('option').filter({ hasText: DELETED_DECK.name })).toHaveCount(0)
    await expect(page.getByRole('listbox').getByRole('option').filter({ hasText: KEPT_DECK.name })).toHaveCount(1)

    // A public deck belongs to nobody, so it never carries the action.
    await page.getByRole('radio', { name: STARTER_DECKS }).click()
    await openDeckOptions(page)
    await expect(page.getByTestId('deckOptions-option-action')).toHaveCount(0)
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

async function mockDecks(
  page: Page,
  decks: { savedDecks: Array<{ id: string; name: string }>; publicDecks: Array<{ id: string; name: string }> },
): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/deck',
    async (route) => {
      const isPlayerList = new URL(route.request().url()).searchParams.has('userId')
      const payload = isPlayerList
        ? decks.savedDecks.map((deck) => ({ ...deck, type: 'User', userId: null, leaderColor: null, cards: [] }))
        : decks.publicDecks.map((deck) => ({ ...deck, type: 'Public', userId: null, leaderColor: null, cards: [] }))

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      })
    },
  )
}

async function mockDeleteDeck(page: Page): Promise<void> {
  await page.route(
    (url) => url.pathname.startsWith('/api/deck/'),
    async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.continue()
        return
      }

      await route.fulfill({ status: 204, body: '' })
    },
  )
}

/** The list row an option is rendered in, whose trailing button is the deck's delete action. */
function deletionRow(page: Page, deckName: string) {
  return page.getByRole('listbox').locator('li').filter({ hasText: deckName })
}

/** Opens the picker once the mocked saved decks have arrived. */
async function openSavedDeckOptions(page: Page, minimumOptions = 2) {
  return openDeckOptions(page, minimumOptions)
}

async function openDeckOptions(page: Page, minimumOptions = 1) {
  const combobox = page.getByRole('combobox', { name: DECK_OPTIONS })

  await expect.poll(async () => {
    await combobox.click()
    const count = await page.getByRole('listbox').getByRole('option').count()
    await page.keyboard.press('Escape')

    return count
  }, {
    timeout: 30_000,
  }).toBeGreaterThanOrEqual(minimumOptions)

  await combobox.click()
  return page.getByRole('listbox').getByRole('option')
}
