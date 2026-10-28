import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const PERSISTED_SELECTIONS_KEY = 'phv-login-selections'
const DISPLAY_NAME = '#displayName'
const JOIN_CODE = '#joinGameCode'
const DECK_OPTIONS = 'Deck Options'
const FORMAT = 'Format'
const STARTER_DECKS = 'Starter Decks'
const JOIN_OR_HOST = 'Join or Host'
const TIME_RELAXED = 'Time relaxed (no action clock)'
const SELECT_PLACEHOLDER = 'Select an option'

type PersistedSelections = {
  state?: {
    displayName?: string
    gameEntryMode?: string
    hostTimeRelaxed?: boolean
    deckOptionsMode?: string
    deckOptionsByMode?: Record<string, string>
    [key: string]: unknown
  }
  version?: number
}

/**
 * Setting up the same quick match before every game is the thing this feature removes: the panel is expected to come
 * back exactly as it was left, including after a full reload, and to only move when the player moves it.
 */
test.describe('login selections', () => {
  test.describe.configure({ timeout: 90_000 })

  test('the chosen configuration and display name survive a reload', async ({ page }) => {
    await openLoginView(page)

    await page.locator(DISPLAY_NAME).fill('Persist Tester')
    await page.getByRole('radio', { name: STARTER_DECKS }).click()

    const deck = await selectDeckOption(page, 'last')
    const format = await selectFormat(page, 'last')

    await page.reload()

    await expect(page.locator(DISPLAY_NAME)).toHaveValue('Persist Tester', { timeout: 30_000 })
    await expect(page.getByRole('radio', { name: STARTER_DECKS })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('combobox', { name: FORMAT })).toContainText(format.label, { timeout: 30_000 })
    await expect(page.getByRole('combobox', { name: DECK_OPTIONS })).toContainText(deck.label)
  })

  test('a manual change is what the next visit keeps, and the join code is never remembered', async ({ page }) => {
    await openLoginView(page)

    await page.locator(DISPLAY_NAME).fill('First Name')
    await page.getByRole('radio', { name: STARTER_DECKS }).click()
    const firstDeck = await selectDeckOption(page, 'last')

    await page.reload()
    await expect(page.locator(DISPLAY_NAME)).toHaveValue('First Name', { timeout: 30_000 })

    await page.locator(DISPLAY_NAME).fill('Second Name')
    const secondDeck = await selectDeckOption(page, 'first')

    await page.getByRole('radio', { name: JOIN_OR_HOST }).click()
    await page.locator(JOIN_CODE).fill('ABCDE')
    await page.getByRole('checkbox', { name: TIME_RELAXED }).check()

    await page.reload()

    await expect(page.locator(DISPLAY_NAME)).toHaveValue('Second Name', { timeout: 30_000 })
    await expect(page.getByRole('radio', { name: JOIN_OR_HOST })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('combobox', { name: DECK_OPTIONS })).toContainText(secondDeck.label)
    await expect(page.getByRole('checkbox', { name: TIME_RELAXED })).toBeChecked()

    // One-time by design: the code belongs to the match that was joined, not to the panel.
    await expect(page.locator(JOIN_CODE)).toHaveValue('')

    if (firstDeck.optionCount > 1) {
      expect(secondDeck.label).not.toBe(firstDeck.label)
    }

    const persisted = await readPersistedSelections(page)
    expect(persisted?.state?.displayName).toBe('Second Name')
    expect(persisted?.state?.gameEntryMode).toBe('join_or_host')
    expect(persisted?.state?.hostTimeRelaxed).toBe(true)
    expect(persisted?.state).not.toHaveProperty('joinGameCode')
    expect(persisted?.state).not.toHaveProperty('showDisplayNameError')
  })

  test('a remembered deck that no longer exists leaves the picker empty', async ({ page }) => {
    await page.addInitScript((storageKey: string) => {
      window.localStorage.setItem(storageKey, JSON.stringify({
        state: {
          displayName: 'Ghost Deck Player',
          gameEntryMode: 'quickmatch',
          rulesetIdByMode: { quickmatch: '', host: '' },
          hostTimeRelaxed: false,
          deckOptionsMode: 'starter_decks',
          deckOptionsByMode: {
            import: '',
            saved_decks: '',
            starter_decks: 'deck-that-was-deleted',
          },
        },
        version: 1,
      }))
    }, PERSISTED_SELECTIONS_KEY)

    await openLoginView(page)

    await expect(page.getByRole('radio', { name: STARTER_DECKS })).toHaveAttribute('aria-checked', 'true')

    // Clearing instead of substituting: the picker offers nothing rather than naming a deck the player never chose.
    const deckPicker = page.getByRole('combobox', { name: DECK_OPTIONS })
    await expect(deckPicker).toContainText(SELECT_PLACEHOLDER, { timeout: 30_000 })

    const persisted = await readPersistedSelections(page)
    expect(persisted?.state?.deckOptionsByMode?.starter_decks).toBe('')
    // The rest of the remembered configuration is untouched by that correction.
    expect(persisted?.state?.displayName).toBe('Ghost Deck Player')
  })
})

async function openLoginView(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator(DISPLAY_NAME)).toBeVisible({ timeout: 30_000 })
}

async function readPersistedSelections(page: Page): Promise<PersistedSelections | null> {
  const raw = await page.evaluate((storageKey: string) => window.localStorage.getItem(storageKey), PERSISTED_SELECTIONS_KEY)

  return raw ? (JSON.parse(raw) as PersistedSelections) : null
}

type ISelectResult = {
  label: string
  optionCount: number
}

/**
 * The public deck list arrives after the panel renders, so the control is only worth driving once it carries real
 * decks; opening and closing it is how the count is polled without depending on a fixed delay.
 */
async function selectDeckOption(page: Page, index: 'first' | 'last'): Promise<ISelectResult> {
  const combobox = page.getByRole('combobox', { name: DECK_OPTIONS })

  await expect.poll(async () => {
    await combobox.click()
    const count = await page.getByRole('listbox').getByRole('option').count()
    await page.keyboard.press('Escape')

    return count
  }, {
    timeout: 30_000,
  }).toBeGreaterThan(0)

  return await chooseOption(combobox, page, index)
}

async function selectFormat(page: Page, index: 'first' | 'last'): Promise<ISelectResult> {
  const combobox = page.getByRole('combobox', { name: FORMAT })
  await expect(combobox).toBeEnabled({ timeout: 30_000 })

  return await chooseOption(combobox, page, index)
}

async function chooseOption(
  combobox: ReturnType<Page['getByRole']>,
  page: Page,
  index: 'first' | 'last',
): Promise<ISelectResult> {
  await combobox.click()

  const options = page.getByRole('listbox').getByRole('option')
  const optionCount = await options.count()
  const target = index === 'first' ? options.first() : options.last()
  // The option renders its label and, for formats, a queued-count trailing element: only the label is the name this
  // spec compares across a reload.
  const label = (await target.locator('span').first().innerText()).trim()

  await target.click()

  return { label, optionCount }
}
