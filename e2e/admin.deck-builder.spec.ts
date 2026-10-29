import { expect, test } from '@playwright/test'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { createAdminSession } from './helpers/adminSession'
import {
  buildMockLegalDeckCards,
  installDeckAdminMocks,
  toMockDeckListText,
} from './helpers/deckAdminMocks'
import type {
  DeckAdminMockCardLine,
  DeckAdminMockState,
  IDeckAdminMockOptions,
} from './helpers/deckAdminMocks'

const AUTH_STORAGE_KEY = 'phv-auth-session'

type IOpenedDeckBuilder = {
  context: BrowserContext
  page: Page
  state: DeckAdminMockState
}

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
  await expect(page.getByTestId('deck-admin-ruleset-status').first()).toBeVisible({ timeout: 30_000 })

  return { context, page, state }
}

function cardTile(page: Page, cardId: string) {
  return page.locator(`[data-testid="catalog-card-tile"][data-card-id="${cardId}"]`)
}

function violation(page: Page, code: string) {
  return page.locator(`[data-testid="deck-admin-validation"] [data-violation-code="${code}"]`)
}

function rulesetStatus(page: Page, key: string) {
  return page.locator(`[data-testid="deck-admin-ruleset-status"][data-ruleset-key="${key}"]`)
}

function rulesetViolation(page: Page, key: string, code: string) {
  return rulesetStatus(page, key).locator(`[data-violation-code="${code}"]`)
}

function selectedRow(page: Page, cardId: string) {
  return page.locator(`[data-testid="deck-admin-card-row"][data-card-id="${cardId}"]`)
}

function quantitiesOf(cards: Array<{ cardId: string; quantity: number }> | undefined) {
  return Object.fromEntries((cards ?? []).map((card) => [card.cardId, card.quantity]))
}

function totalNonLeaderCards(cards: Array<{ cardId: string; quantity: number }> | undefined) {
  return (cards ?? []).reduce(
    (total, card) => (card.cardId === 'L-001' || card.cardId === 'L-002' ? total : total + card.quantity),
    0,
  )
}

function legalDeck(nonLeaderCount: number, maxCopies = 4): DeckAdminMockCardLine[] {
  return [{ cardId: 'L-001', quantity: 1 }, ...buildMockLegalDeckCards(nonLeaderCount, maxCopies)]
}

async function importDeckList(page: Page, cards: DeckAdminMockCardLine[]) {
  await page.getByTestId('admin-deck-import').click()
  await page.getByTestId('admin-deck-import-payload').fill(toMockDeckListText(cards))
  await expect(page.getByTestId('admin-deck-import-confirm')).toBeEnabled()
  await page.getByTestId('admin-deck-import-confirm').click()
}

test('the deck builder gates saves per format and creates a legal deck', async ({ browser, request }) => {
  const { context, page, state } = await openDeckBuilder(browser, request, '/admin/decks')

  await page.getByTestId('admin-deck-name').fill('Red Test Deck')

  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()
  await expect(page.getByTestId('admin-deck-save')).toHaveAttribute('data-save-state', 'blocked')

  await importDeckList(page, legalDeck(50))

  await expect(rulesetStatus(page, 'standard')).toHaveAttribute('data-ruleset-legal', 'true')
  await expect(rulesetStatus(page, 'pre-release')).toHaveAttribute('data-ruleset-legal', 'false')
  await expect(page.getByTestId('deck-admin-leader-name')).toHaveText('Red Leader')
  await expect(selectedRow(page, 'L-001')).toHaveCount(0)
  await expect(page.getByTestId('admin-deck-save')).toBeEnabled()
  await expect(page.getByTestId('admin-deck-save')).toHaveAttribute('data-save-state', 'ready')

  await page.getByTestId('deck-admin-leader-clear').click()
  await expect(violation(page, 'leaderCount').first()).toBeVisible()
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  await cardTile(page, 'L-001').click()
  await expect(page.getByTestId('deck-admin-leader-name')).toHaveText('Red Leader')
  await expect(violation(page, 'leaderCount')).toHaveCount(0)

  const includeNonDeckableSwitch = page.getByTestId('catalog-nondeckable-toggle').locator('label')
  await includeNonDeckableSwitch.click()
  await cardTile(page, 'K-001').click()
  await expect(violation(page, 'unsupportedCardType').first()).toBeVisible()
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  await cardTile(page, 'K-001').getByTestId('catalog-card-remove-copy').click()
  await expect(violation(page, 'unsupportedCardType')).toHaveCount(0)
  await includeNonDeckableSwitch.click()

  await cardTile(page, 'C-002').click()
  await expect(violation(page, 'colorMismatch').first()).toBeVisible()
  await expect(selectedRow(page, 'C-002')).toHaveAttribute('data-color-tone', 'blue')
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  await cardTile(page, 'C-002').getByTestId('catalog-card-remove-copy').click()
  await expect(violation(page, 'colorMismatch')).toHaveCount(0)

  await cardTile(page, 'C-001').click()
  await expect(cardTile(page, 'C-001')).toHaveAttribute('data-copy-count', '5')
  await expect(rulesetViolation(page, 'standard', 'tooManyCopies')).toHaveCount(1)
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  await cardTile(page, 'C-001').getByTestId('catalog-card-remove-copy').click()
  await expect(rulesetViolation(page, 'standard', 'tooManyCopies')).toHaveCount(0)
  await expect(page.getByTestId('admin-deck-save')).toBeEnabled()

  await page.getByTestId('admin-deck-save').click()

  await expect(page).toHaveURL(/\/admin\/decks\/mock-deck-1$/)
  await expect.poll(() => state.createPayload?.name ?? null).toBe('Red Test Deck')
  expect(quantitiesOf(state.createPayload?.cards)['L-001']).toBe(1)
  expect(totalNonLeaderCards(state.createPayload?.cards)).toBe(50)

  await context.close()
})

test('the deck builder loads a deck, replaces it from an import and updates it', async ({ browser, request }) => {
  const { context, page, state } = await openDeckBuilder(browser, request, '/admin/decks/mock-seed', {
    decks: [
      {
        id: 'mock-seed',
        name: 'Seeded Red',
        cards: legalDeck(50),
      },
    ],
  })

  await expect(page.getByTestId('admin-deck-name')).toHaveValue('Seeded Red')

  await expect(page.getByTestId('deck-admin-leader-name')).toHaveText('Red Leader')
  await expect(page.getByTestId('deck-admin-leader-slot')).toHaveAttribute('data-color-tone', 'red')
  await expect(selectedRow(page, 'L-001')).toHaveCount(0)
  await expect(selectedRow(page, 'C-001')).toHaveAttribute('data-copy-count', '4')
  await expect(selectedRow(page, 'C-001')).toHaveAttribute('data-color-tone', 'red')

  const openDeckRailItem = page.getByTestId('admin-deck-list-item').first()
  await expect(openDeckRailItem).toHaveAttribute('data-color-tone', 'red')
  await expect(openDeckRailItem).toHaveAttribute('data-selected', 'true')

  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()
  await expect(rulesetStatus(page, 'standard')).toHaveAttribute('data-ruleset-legal', 'true')
  await expect(rulesetStatus(page, 'pre-release')).toHaveAttribute('data-ruleset-legal', 'false')

  await page.getByTestId('deck-admin-leader-clear').click()
  await expect(violation(page, 'leaderCount').first()).toBeVisible()
  await expect(page.getByTestId('admin-deck-save')).toBeDisabled()

  await cardTile(page, 'L-001').click()
  await expect(page.getByTestId('deck-admin-leader-name')).toHaveText('Red Leader')
  await expect(violation(page, 'leaderCount')).toHaveCount(0)

  await importDeckList(page, legalDeck(30, 3))

  await expect(rulesetStatus(page, 'pre-release')).toHaveAttribute('data-ruleset-legal', 'true')
  await expect(rulesetStatus(page, 'standard')).toHaveAttribute('data-ruleset-legal', 'false')
  await expect(selectedRow(page, 'C-001')).toHaveAttribute('data-copy-count', '3')
  await expect(page.getByTestId('admin-deck-save')).toBeEnabled()

  await page.getByTestId('admin-deck-save').click()

  await expect.poll(() => state.updatePayload?.deckId ?? null).toBe('mock-seed')
  expect(state.updatePayload?.name).toBe('Seeded Red')
  expect(quantitiesOf(state.updatePayload?.cards)['L-001']).toBe(1)
  expect(totalNonLeaderCards(state.updatePayload?.cards)).toBe(30)

  await context.close()
})

test('the deck builder exports the draft in the format the import window reads', async ({ browser, request }) => {
  const seededCards = legalDeck(50)
  const { context, page } = await openDeckBuilder(browser, request, '/admin/decks/mock-export', {
    decks: [
      {
        id: 'mock-export',
        name: 'Exportable',
        cards: seededCards,
      },
    ],
  })

  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await expect(page.getByTestId('admin-deck-export')).toBeEnabled()

  await page.getByTestId('admin-deck-export').click()
  await expect(page.getByText(/Copied \d+ card lines/)).toBeVisible({ timeout: 10_000 })

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  const exportedLines = clipboardText.split('\n').map((line) => line.trim()).filter(Boolean).sort()
  const expectedLines = toMockDeckListText(seededCards).split('\n').sort()

  expect(exportedLines).toEqual(expectedLines)
  expect(exportedLines.every((line) => /^\d+x [A-Z0-9-]+$/.test(line))).toBe(true)

  // The round trip is the point of the format: the exported text goes straight back into the import dialog.
  await page.getByTestId('admin-deck-import').click()
  await page.getByTestId('admin-deck-import-payload').fill(clipboardText)
  await expect(page.getByTestId('admin-deck-import-confirm')).toBeEnabled()
  await page.getByTestId('admin-deck-import-confirm').click()
  await expect(rulesetStatus(page, 'standard')).toHaveAttribute('data-ruleset-legal', 'true')

  await context.close()
})

test('the deck builder has nothing to export on an empty new deck', async ({ browser, request }) => {
  const { context, page } = await openDeckBuilder(browser, request, '/admin/decks')

  await expect(page.getByTestId('admin-deck-export')).toBeDisabled()

  await context.close()
})

test('the deck builder deletes a deck, and reports a deck a game still uses', async ({ browser, request }) => {
  const { context, page, state } = await openDeckBuilder(browser, request, '/admin/decks/mock-in-use', {
    decks: [
      {
        id: 'mock-in-use',
        name: 'In Use',
        cards: legalDeck(50),
      },
    ],
    undeletableDeckId: 'mock-in-use',
  })

  await page.getByTestId('admin-deck-delete').click()
  await page.getByTestId('admin-deck-delete-confirm').click()

  await expect.poll(() => state.deleteRequests.length).toBe(1)
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
        cards: legalDeck(50),
      },
    ],
  })

  await page.getByTestId('admin-deck-delete').click()
  await page.getByTestId('admin-deck-delete-confirm').click()

  await expect.poll(() => state.deleteRequests.length).toBe(1)
  await expect(page).toHaveURL(/\/admin\/decks$/)

  await context.close()
})
