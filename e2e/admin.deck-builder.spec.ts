import { expect, test } from '@playwright/test'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { createAdminSession } from './helpers/adminSession'
import { installDeckAdminMocks } from './helpers/deckAdminMocks'
import type { DeckAdminMockState, IDeckAdminMockOptions } from './helpers/deckAdminMocks'

const AUTH_STORAGE_KEY = 'phv-auth-session'

type IOpenedDeckBuilder = {
  context: BrowserContext
  page: Page
  state: DeckAdminMockState
}

/**
 * Opens the deck builder as the seeded admin, with the catalogue and every deck endpoint answered by
 * `installDeckAdminMocks`. The context is signed in with a real token (see `createAdminSession`) so the request
 * paths are the same ones a production browser takes; only the server's answers are mocked.
 */
async function openDeckBuilder(
  browser: Browser,
  request: APIRequestContext,
  path: string,
  options: IDeckAdminMockOptions = {},
): Promise<IOpenedDeckBuilder> {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } })
  const adminSession = await createAdminSession(request)

  await context.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session))
    },
    { key: AUTH_STORAGE_KEY, session: adminSession },
  )

  const page = await context.newPage()
  const state = await installDeckAdminMocks(page, options)

  await page.goto(path)
  await expect(page.getByTestId('catalog-card-tile').first()).toBeVisible({ timeout: 30_000 })

  return { context, page, state }
}

function cardTile(page: Page, cardId: string) {
  return page.locator(`[data-testid="catalog-card-tile"][data-card-id="${cardId}"]`)
}

function violation(page: Page, code: string) {
  return page.locator(`[data-testid="deck-admin-validation"] [data-violation-code="${code}"]`)
}

function selectedRow(page: Page, cardId: string) {
  return page.locator(`[data-testid="deck-admin-card-row"][data-card-id="${cardId}"]`)
}

function quantitiesOf(cards: Array<{ cardId: string; quantity: number }> | undefined) {
  return Object.fromEntries((cards ?? []).map((card) => [card.cardId, card.quantity]))
}

test('the deck builder blocks an illegal save and creates a legal deck', async ({ browser, request }) => {
  const { context, page, state } = await openDeckBuilder(browser, request, '/admin/decks')

  // Every catalogue tile is outlined in the colour printed on the card.
  await expect(cardTile(page, 'L-001')).toHaveAttribute('data-color-tone', 'red')
  await expect(cardTile(page, 'C-002')).toHaveAttribute('data-color-tone', 'blue')

  // Chakra and Summon cannot go in a deck, so the catalogue hides them by default; the toggle shows them for the
  // author who wants to look, and the rules still refuse to save one.
  await expect(cardTile(page, 'K-001')).toHaveCount(0)

  // The switch is a label with the real checkbox hidden under the track (the track paints the control), so the
  // click targets the label the way a person's click would.
  const includeNonDeckableSwitch = page.getByTestId('deck-admin-nondeckable-toggle').locator('label')
  const includeNonDeckableCheckbox = page.getByRole('checkbox', {
    name: 'Include Chakra and Summon cards in the catalog',
  })

  await includeNonDeckableSwitch.click()
  await expect(includeNonDeckableCheckbox).toBeChecked()
  await expect(cardTile(page, 'K-001')).toHaveCount(1)

  await cardTile(page, 'K-001').click()
  await expect(violation(page, 'unsupportedCardType')).toBeVisible()
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  await cardTile(page, 'K-001').getByTestId('catalog-card-remove-copy').click()
  await expect(violation(page, 'unsupportedCardType')).toHaveCount(0)

  await includeNonDeckableSwitch.click()
  await expect(includeNonDeckableCheckbox).not.toBeChecked()
  await expect(cardTile(page, 'K-001')).toHaveCount(0)

  await page.getByTestId('admin-deck-name').fill('Red Test Deck')

  // An empty deck is invalid, so the save is unavailable before a single card is picked.
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  // Cards without a leader: the rule that needs the leader is reported immediately. The tile keeps its colour
  // background and takes the primary outline while it holds copies.
  await cardTile(page, 'C-001').click()
  await expect(cardTile(page, 'C-001')).toHaveAttribute('data-marked', 'true')
  await expect(violation(page, 'leaderCount')).toBeVisible()
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  // A leader click fills the leader slot; it never becomes a card line, and the slot is outlined in the
  // leader's own colour.
  await cardTile(page, 'L-001').click()
  await expect(page.getByTestId('deck-admin-leader-slot')).toHaveAttribute('data-card-id', 'l-001')
  await expect(page.getByTestId('deck-admin-leader-slot')).toHaveAttribute('data-color-tone', 'red')
  await expect(page.getByTestId('deck-admin-leader-name')).toHaveText('Red Leader')
  await expect(page.locator('[data-testid="deck-admin-card-row"][data-card-id="L-001"]')).toHaveCount(0)
  await expect(violation(page, 'leaderCount')).toHaveCount(0)
  await expect(page.getByTestId('deck-admin-validation-ok')).toBeVisible()
  await expect(page.getByTestId('admin-deck-save')).toBeEnabled()

  // The card list repeats each card's colour on its own outline, not only in the type/colour text.
  await expect(selectedRow(page, 'C-001')).toHaveAttribute('data-color-tone', 'red')

  // Picking another leader replaces the first: the slot is the only place a leader can live, so two leaders
  // cannot be built at all - there is nothing left for the leader count rule to catch.
  await cardTile(page, 'L-002').click()
  await expect(page.getByTestId('deck-admin-leader-name')).toHaveText('Blue Leader')
  await expect(page.getByTestId('deck-admin-leader-slot')).toHaveAttribute('data-color-tone', 'blue')
  await expect(page.locator('[data-testid="deck-admin-card-row"][data-card-id="L-001"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="deck-admin-card-row"][data-card-id="L-002"]')).toHaveCount(0)

  // The red card now clashes with the blue leader, which is exactly the colour rule following the slot.
  await expect(violation(page, 'colorMismatch')).toBeVisible()

  await cardTile(page, 'L-001').click()
  await expect(page.getByTestId('deck-admin-leader-name')).toHaveText('Red Leader')
  await expect(violation(page, 'colorMismatch')).toHaveCount(0)

  // A card that does not match the leader's colour is reported, and the save is blocked again. Its row is still
  // outlined in its own colour - the outline says what the card is, the validation list says what is wrong.
  await cardTile(page, 'C-002').click()
  await expect(violation(page, 'colorMismatch')).toBeVisible()
  await expect(selectedRow(page, 'C-002')).toHaveAttribute('data-color-tone', 'blue')
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  // The blue card's controls are still the fixed neutral/danger/success tones: only the outline is blue.
  await expect(selectedRow(page, 'C-002').getByTestId('deck-admin-card-count')).toHaveAttribute('data-tone', 'neutral')
  await expect(selectedRow(page, 'C-002').getByTestId('deck-admin-card-remove')).toHaveAttribute('data-tone', 'danger')
  await expect(selectedRow(page, 'C-002').getByTestId('deck-admin-card-add')).toHaveAttribute('data-tone', 'success')

  await cardTile(page, 'C-002')
    .getByTestId('catalog-card-remove-copy')
    .click()
  await expect(violation(page, 'colorMismatch')).toHaveCount(0)

  // Quantity controls keep fixed tones so their meaning never depends on the card: the number is neutral, the
  // minus is red and the plus is green. Only the row's outline carries the card's colour.
  const c001Row = selectedRow(page, 'C-001')
  await expect(c001Row.getByTestId('deck-admin-card-count')).toHaveAttribute('data-tone', 'neutral')
  await expect(c001Row.getByTestId('deck-admin-card-remove')).toHaveAttribute('data-tone', 'danger')
  await expect(c001Row.getByTestId('deck-admin-card-add')).toHaveAttribute('data-tone', 'success')

  // A fifth copy of a non-leader card is allowed into the draft, and only the save is gated.
  for (let click = 0; click < 4; click += 1) {
    await cardTile(page, 'C-001').click()
  }

  await expect(cardTile(page, 'C-001')).toHaveAttribute('data-copy-count', '5')
  await expect(violation(page, 'tooManyCopies')).toBeVisible()
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  await cardTile(page, 'C-001')
    .getByTestId('catalog-card-remove-copy')
    .click()
  await expect(violation(page, 'tooManyCopies')).toHaveCount(0)
  await expect(page.getByTestId('admin-deck-save')).toBeEnabled()

  await page.getByTestId('admin-deck-save').click()

  await expect(page).toHaveURL(/\/admin\/decks\/mock-deck-1$/)
  await expect.poll(() => state.createPayload?.name ?? null).toBe('Red Test Deck')
  expect(quantitiesOf(state.createPayload?.cards)).toEqual({ 'L-001': 1, 'C-001': 4 })

  await context.close()
})

test('the deck builder loads, imports into and updates an existing deck', async ({ browser, request }) => {
  const { context, page, state } = await openDeckBuilder(browser, request, '/admin/decks/mock-seed', {
    decks: [
      {
        id: 'mock-seed',
        name: 'Seeded Red',
        cards: [
          { cardId: 'L-001', quantity: 1 },
          { cardId: 'C-001', quantity: 2 },
        ],
      },
    ],
  })

  await expect(page.getByTestId('admin-deck-name')).toHaveValue('Seeded Red')

  // The loaded leader is in the slot, not in the card list, and both the slot and the card row carry the
  // colour of the card they contain. The rail's deck entry carries the leader's colour too.
  await expect(page.getByTestId('deck-admin-leader-name')).toHaveText('Red Leader')
  await expect(page.getByTestId('deck-admin-leader-slot')).toHaveAttribute('data-color-tone', 'red')
  await expect(selectedRow(page, 'L-001')).toHaveCount(0)
  await expect(selectedRow(page, 'C-001')).toHaveAttribute('data-copy-count', '2')
  await expect(selectedRow(page, 'C-001')).toHaveAttribute('data-color-tone', 'red')

  // The open deck is highlighted in its own colour: the rail item carries the tone and the selected marker.
  const openDeckRailItem = page.getByTestId('admin-deck-list-item').first()
  await expect(openDeckRailItem).toHaveAttribute('data-color-tone', 'red')
  await expect(openDeckRailItem).toHaveAttribute('data-selected', 'true')

  // Nothing changed yet, so there is nothing to save.
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  // Clearing the slot is the only way to remove a leader, and it is immediately visible as a missing leader.
  await page.getByTestId('deck-admin-leader-clear').click()
  await expect(violation(page, 'leaderCount')).toBeVisible()
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  await cardTile(page, 'L-001').click()
  await expect(page.getByTestId('deck-admin-leader-name')).toHaveText('Red Leader')
  await expect(violation(page, 'leaderCount')).toHaveCount(0)

  // Import is additive: the pasted lines are merged into the loaded draft, not swapped for it.
  await page.getByTestId('admin-deck-import').click()
  await page.getByTestId('admin-deck-import-payload').fill('2x C-003')
  await page.getByTestId('admin-deck-import-confirm').click()

  await expect(selectedRow(page, 'C-003')).toHaveAttribute('data-copy-count', '2')
  await expect(page.getByTestId('admin-deck-save')).toBeEnabled()

  await page.getByTestId('admin-deck-save').click()

  await expect.poll(() => state.updatePayload?.deckId ?? null).toBe('mock-seed')
  expect(state.updatePayload?.name).toBe('Seeded Red')
  expect(quantitiesOf(state.updatePayload?.cards)).toEqual({ 'L-001': 1, 'C-001': 2, 'C-003': 2 })

  await context.close()
})

test('the deck builder deletes a deck, and reports a deck a game still uses', async ({ browser, request }) => {
  const { context, page, state } = await openDeckBuilder(browser, request, '/admin/decks/mock-in-use', {
    decks: [
      {
        id: 'mock-in-use',
        name: 'In Use',
        cards: [{ cardId: 'L-001', quantity: 1 }],
      },
    ],
    undeletableDeckId: 'mock-in-use',
  })

  await page.getByTestId('admin-deck-delete').click()
  await page.getByTestId('admin-deck-delete-confirm').click()

  await expect.poll(() => state.deleteRequests.length).toBe(1)
  // The server refused because a game instance still points at the deck; the reason is surfaced, the dialog stays.
  await expect(page.getByText(/assigned to a game instance/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('admin-deck-delete-dialog')).toBeVisible()

  await page.getByRole('button', { name: 'Cancel' }).click()
  await context.close()
})

test('the deck builder deletes an unreferenced deck and returns to the create screen', async ({ browser, request }) => {
  const { context, page, state } = await openDeckBuilder(browser, request, '/admin/decks/mock-free', {
    decks: [
      {
        id: 'mock-free',
        name: 'Free Deck',
        cards: [{ cardId: 'L-001', quantity: 1 }],
      },
    ],
  })

  await page.getByTestId('admin-deck-delete').click()
  await page.getByTestId('admin-deck-delete-confirm').click()

  await expect.poll(() => state.deleteRequests.length).toBe(1)
  await expect(page).toHaveURL(/\/admin\/decks$/)

  await context.close()
})
