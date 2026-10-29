import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { createAdminSession } from './helpers/adminSession'

const AUTH_SESSION_KEY = 'phv-auth-session'
const DECK_OPTIONS = 'Deck Options'
const SAVED_DECKS = 'Saved Decks'

const RECORDED_DECK = {
  id: 'deck-recorded',
  name: 'Recorded deck',
  record: { wins: 7, losses: 3, draws: 0 },
}

const DRAWN_DECK = {
  id: 'deck-drawn',
  name: 'Drawn deck',
  record: { wins: 0, losses: 0, draws: 2 },
}

const UNPLAYED_DECK = {
  id: 'deck-unplayed',
  name: 'Unplayed deck',
}

type MockDeck = {
  id: string
  name: string
  record?: { wins: number; losses: number; draws: number }
}

/**
 * A deck's record belongs to the player who played it, so the picker is where it is useful: the list carries a compact
 * wins/losses line (and the win rate), and the summary under it spells the same thing out. A deck that was never
 * played stays a plain name in the list and reads as "No games yet" once selected - never as a silent 0%.
 *
 * The deck endpoint is mocked here so the spec owns the records it asserts: the numbers are the server's, and what is
 * under test is how the picker presents them.
 */
test.describe('deck records', () => {
  test.describe.configure({ timeout: 90_000 })

  test('the saved deck list and summary show the player record', async ({ page, request }) => {
    await seedSession(page, request)
    await mockDecks(page, [RECORDED_DECK, DRAWN_DECK, UNPLAYED_DECK])

    await page.goto('/')
    await expect(page.locator('#displayName')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('radio', { name: SAVED_DECKS }).click()

    const options = await openSavedDeckOptions(page)

    // The record rides on each option as a badge, so the numbers are visible while the list is open.
    const recordedRow = options.filter({ hasText: 'Recorded deck' })
    const drawnRow = options.filter({ hasText: 'Drawn deck' })
    const unplayedRow = options.filter({ hasText: 'Unplayed deck' })

    await expect(recordedRow).toHaveCount(1)
    await expect(recordedRow).toContainText('7W–3L (70%)')
    await expect(drawnRow).toContainText('2D')
    // A deck nobody has played still reports its counters instead of staying silent.
    await expect(unplayedRow).toContainText('0W–0L')

    await recordedRow.click()
    await expect(page.getByRole('combobox', { name: DECK_OPTIONS })).toContainText('7W–3L (70%)')
    await expect(page.getByTestId('login-deck-record')).toHaveText('7W–3L · 70% win rate')

    await openSavedDeckOptions(page)
    await page.getByRole('listbox').getByRole('option').filter({ hasText: 'Unplayed deck' }).click()
    await expect(page.getByRole('combobox', { name: DECK_OPTIONS })).toContainText('0W–0L')
    await expect(page.getByTestId('login-deck-record')).toHaveText('No games yet')
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

/** Only the deck listing is faked: the player's own list when the caller asks for it, and no public decks. */
async function mockDecks(page: Page, savedDecks: MockDeck[]): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/deck',
    async (route) => {
      const isPlayerList = new URL(route.request().url()).searchParams.has('userId')

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          isPlayerList
            ? savedDecks.map((deck) => ({
              ...deck,
              type: 'User',
              userId: null,
              leaderColor: null,
              cards: [],
            }))
            : [],
        ),
      })
    },
  )
}

/**
 * The list arrives after the panel renders, so the picker is only worth driving once it carries the mocked decks.
 * Opening and closing it is how the count is polled without depending on a fixed delay.
 */
async function openSavedDeckOptions(page: Page) {
  const combobox = page.getByRole('combobox', { name: DECK_OPTIONS })

  await expect.poll(async () => {
    await combobox.click()
    const count = await page.getByRole('listbox').getByRole('option').count()
    await page.keyboard.press('Escape')

    return count
  }, {
    timeout: 30_000,
  }).toBeGreaterThan(1)

  await combobox.click()
  return page.getByRole('listbox').getByRole('option')
}
