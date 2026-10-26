import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

/**
 * Create mode is exercised with the network mocked, for the same reason quick match is: the ruleset list, the
 * catalogue lookups, the guest session, the deck write and the game create call are all stubbed, so this spec can
 * use a two-card format instead of writing throw-away rulesets (and full-size decks) into the shared e2e database.
 *
 * What is under test is the hand-off: `Enter Game` mints a real game, holds the creator on the login view with its
 * code and invite link, and only opens the board once they confirm. The server-side half - that a created game
 * only admits decks fitting the format it was created under - lives in GamesServiceUserDeckFlowTests.
 */

const RULESET_ID = '20000000-0000-0000-0000-0000000000e3'
const CREATED_GAME_CODE = 'E2EBB'

const MOCKED_RULESET = {
  id: RULESET_ID,
  key: 'e2e-format',
  name: 'E2E Format',
  isActive: true,
  leaderCount: 1,
  nonLeaderCardCount: 2,
  maxCopiesPerNonLeaderCard: 4,
  requireLeaderColorMatch: false,
  allowChakraCards: true,
  allowSummonCards: true,
  sortOrder: 0,
  cardRestrictions: [],
}

const MOCKED_CARDS = [
  { id: 'L-001', displayName: 'Test Leader', type: 'Leader', color: 'Red' },
  { id: 'N-001', displayName: 'Test Character', type: 'Character', color: 'Red' },
]

const MOCKED_PRESENCE = {
  onlineViewers: 3,
  // A live queue for the same format, so "no badge in create mode" is proven rather than assumed.
  waitingByRuleset: [{ rulesetId: RULESET_ID, rulesetName: MOCKED_RULESET.name, waitingCount: 3 }],
  authenticatedViewers: 1,
  anonymousViewers: 2,
}

type CreateGamePayload = {
  userId?: string
  deckId?: string
  rulesetId?: string
}

type CreateGameMockOptions = {
  /**
   * Number of state reads that still report an empty table. The dialog polls the game it just created, so setting
   * this to 1 means "the opponent sits down right after the first read".
   */
  lonelyStateReads?: number
  /** Answers every state read with a 404, as if the game had vanished or the creator were no longer in it. */
  failStateRead?: boolean
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function mockCreateGameNetwork(
  page: Page,
  options: CreateGameMockOptions = {},
): Promise<{ createPayloads: CreateGamePayload[]; gameStatePaths: string[] }> {
  const createPayloads: CreateGamePayload[] = []
  const gameStatePaths: string[] = []
  let gameStateReads = 0

  await page.route(/\/api\/deck-rulesets$/, (route) => fulfillJson(route, [MOCKED_RULESET]))

  // Presence is mocked too, and its socket is refused: a live snapshot would overwrite the figures under test.
  await page.route(/\/api\/presence$/, (route) => fulfillJson(route, MOCKED_PRESENCE))
  await page.route(/\/hubs\/presence(\/.*)?(\?.*)?$/, (route) => route.abort())

  await page.route(/\/api\/card\/catalog(\/by-ids)?(\?.*)?$/, (route) => fulfillJson(route, MOCKED_CARDS))

  await page.route(/\/api\/deck(\?.*)?$/, async (route) => {
    if (route.request().method() === 'POST') {
      await fulfillJson(route, 'e2e-deck-id', 201)
      return
    }

    await fulfillJson(route, [])
  })

  await page.route(/\/api\/user\/guest$/, (route) =>
    fulfillJson(route, {
      id: '11111111-1111-1111-1111-111111111111',
      username: 'Guest One',
      email: 'guest+e2e@guests.invalid',
      accessToken: 'e2e-guest-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }),
  )

  // The create call is the one endpoint this spec cares about: it answers with the code the dialog must show and
  // records the payload, so the format the player picked is proven to travel with the request.
  await page.route(/\/api\/games$/, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback()
      return
    }

    createPayloads.push((route.request().postDataJSON() ?? {}) as CreateGamePayload)
    await fulfillJson(route, { id: CREATED_GAME_CODE })
  })

  // The share dialog polls its own game while the creator waits. The route names the code exactly as the server
  // handed it out: game codes are case sensitive server side, so a lowercased request would fall through to the
  // real API here and the hand-over would never happen - which is the regression this spec has to catch.
  await page.route(new RegExp(`/api/games/${CREATED_GAME_CODE}/state$`), async (route) => {
    gameStatePaths.push(new URL(route.request().url()).pathname)

    if (options.failStateRead) {
      await fulfillJson(route, { description: 'Game instance was not found.' }, 404)
      return
    }

    gameStateReads += 1
    const lonelyStateReads = options.lonelyStateReads ?? Number.POSITIVE_INFINITY
    // Only the seat count matters to the dialog, so the payload carries nothing else.
    const players = gameStateReads > lonelyStateReads ? [{}, {}] : [{}]

    await fulfillJson(route, { gameId: CREATED_GAME_CODE, players })
  })

  return { createPayloads, gameStatePaths }
}

/** The import dialog keeps the last deck list in localStorage, so seeding it skips the dialog entirely. */
const CACHED_DECK_KEY = 'phv-imported-deck'

async function seedImportedDeck(page: Page, deckText: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        window.localStorage.setItem(key, value)
      } catch {
        // Storage can be unavailable on the very first about:blank navigation; the next one works.
      }
    },
    [CACHED_DECK_KEY, deckText],
  )
}

/** Create mode, like quick match, asks for a format instead of a code; the first active format is pre-selected. */
async function submitCreate(page: Page): Promise<void> {
  await seedImportedDeck(page, '1x L-001\n2x N-001')
  await page.goto('/')
  await page.getByLabel('Display Name').fill('Guest One')
  await page.getByRole('radio', { name: 'Create' }).click()

  await expect(page.getByRole('combobox', { name: 'Game Code' })).toContainText(MOCKED_RULESET.name)
  // Queue depth is a matchmaking figure - who is waiting to be paired - which a creator opening their own table
  // has no use for, so the create-mode format list stays plain.
  await expect(page.getByTestId('queued-players-count')).toHaveCount(0)
  await page.getByRole('button', { name: 'Enter Game' }).click()
}

test.use({ permissions: ['clipboard-read', 'clipboard-write'] })

test('create binds the game to the selected format and shows its code and invite link', async ({ page }) => {
  const { createPayloads } = await mockCreateGameNetwork(page)

  await submitCreate(page)

  const shareDialog = page.getByRole('dialog', { name: /Your E2E Format game is ready/ })
  await expect(shareDialog).toBeVisible()
  await expect(page.getByTestId('create-game-code')).toHaveText(CREATED_GAME_CODE)

  const origin = new URL(page.url()).origin
  const inviteLink = `${origin}/game/${CREATED_GAME_CODE}`
  await expect(page.getByTestId('create-game-link')).toHaveValue(inviteLink)

  // The creator stays on the login view until they confirm, so the invite can be sent before the board covers it.
  expect(new URL(page.url()).pathname).toBe('/')
  expect(createPayloads).toHaveLength(1)
  expect(createPayloads[0].rulesetId).toBe(RULESET_ID)
  expect(createPayloads[0].deckId).toBe('e2e-deck-id')
})

test('the share dialog copies the code and the link, and Enter Game opens the board', async ({ page }) => {
  await mockCreateGameNetwork(page)

  await submitCreate(page)

  await page.getByTestId('create-game-copy-code').click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(CREATED_GAME_CODE)

  const origin = new URL(page.url()).origin
  const inviteLink = `${origin}/game/${CREATED_GAME_CODE}`
  await page.getByTestId('create-game-copy-link').click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(inviteLink)

  await page.getByTestId('create-game-enter').click()

  await page.waitForURL(new RegExp(`/game/${CREATED_GAME_CODE}$`))
})

test('the creator is handed over as soon as the second player joins', async ({ page }) => {
  // The first state read still shows an empty table; every read after it sees the opponent seated.
  const { gameStatePaths } = await mockCreateGameNetwork(page, { lonelyStateReads: 1 })

  await submitCreate(page)

  await expect(page.getByTestId('create-game-waiting')).toHaveText(
    'Waiting for your opponent to join.',
  )

  // Nothing is clicked: the dialog notices the taken seat and takes the creator in on its own.
  await page.waitForURL(new RegExp(`/game/${CREATED_GAME_CODE}$`))

  // Every check asked for the code exactly as the server returned it. Game codes are case sensitive server side,
  // so a folded code answers "not found" and the creator is never handed over.
  const expectedPath = `/api/games/${CREATED_GAME_CODE}/state`
  expect(gameStatePaths.length).toBeGreaterThanOrEqual(2)
  expect(gameStatePaths.filter((path) => path !== expectedPath)).toEqual([])
})

test('a game that can no longer be checked says so and offers a way back', async ({ page }) => {
  await mockCreateGameNetwork(page, { failStateRead: true })

  await submitCreate(page)

  // The poll retries before giving up, so this note means "the wait itself is broken", not a one-off hiccup.
  await expect(page.getByTestId('create-game-waiting')).toHaveText(
    'This game can no longer be checked. Use Enter Game to try again, or go back.',
  )

  await page.getByTestId('create-game-back').click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enter Game' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/')
})
