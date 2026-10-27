import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

/**
 * Hosting is exercised with the network mocked, for the same reason quick match is: the ruleset list, the catalogue
 * lookups, the guest session, the deck write and the game create call are all stubbed, so this spec can use a
 * two-card format instead of writing throw-away rulesets (and full-size decks) into the shared e2e database.
 *
 * What is under test is the hand-off: `Host` mints a real game, holds the host on the login view with its code and
 * invite link, and only opens the board once they confirm. The server-side half - that a created game only admits
 * decks fitting the format it was created under - lives in GamesServiceUserDeckFlowTests. The last test covers the
 * other half of the shared tab: `Join` posts the typed code and never reaches the create endpoint.
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

  // A typed code resolves to the mocked format, which is what lets the deck summary and the join check speak up.
  await page.route(/\/api\/games\/[A-Z0-9]{5}\/ruleset$/, (route) =>
    fulfillJson(route, {
      id: RULESET_ID,
      key: MOCKED_RULESET.key,
      name: MOCKED_RULESET.name,
    }),
  )

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

/**
 * Hosting, like quick match, asks for a format instead of a code; the first active format is pre-selected. Joining
 * and hosting share a tab, each with its own button, so the format list next to the code field belongs to hosting.
 */
async function submitCreate(page: Page, deckText = '1x L-001\n2x N-001'): Promise<void> {
  await seedImportedDeck(page, deckText)
  await page.goto('/')
  await page.getByLabel('Display Name').fill('Guest One')
  await page.getByRole('radio', { name: 'Join or Host' }).click()

  await expect(page.getByRole('combobox', { name: 'Format' })).toContainText(MOCKED_RULESET.name)
  // Queue depth is a matchmaking figure - who is waiting to be paired - which a host opening their own table
  // has no use for, so the host format list stays plain.
  await expect(page.getByTestId('queued-players-count')).toHaveCount(0)
  await page.getByRole('button', { name: 'Host' }).click()
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

test('an imported deck that does not fit the selected format is refused with a pointer to the import view', async ({
  page,
}) => {
  const { createPayloads } = await mockCreateGameNetwork(page)

  // No leader: the mocked format requires exactly one, so the deck never reaches the create call.
  await submitCreate(page, '2x N-001')

  await expect(
    page.getByText(
      'The selected deck isnt valid for the selected ruleset, please open the import view to see details',
    ),
  ).toBeVisible()
  expect(createPayloads).toHaveLength(0)
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
  await expect(page.getByRole('button', { name: 'Host' })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe('/')
})

/**
 * Joining and hosting share one tab, so the code field's own button has to reach the join endpoint with the typed
 * code, and must never fall through to the create call sitting next to it.
 */
test('the Join button joins the typed code and never creates a game', async ({ page }) => {
  const { createPayloads } = await mockCreateGameNetwork(page)
  // Five characters, because the code field caps its length at the real code length.
  const joinedGameCode = 'E2EJN'
  const joinPayloads: { userId?: string; deckId?: string }[] = []

  await page.route(new RegExp(`/api/games/${joinedGameCode}/join$`), async (route) => {
    joinPayloads.push((route.request().postDataJSON() ?? {}) as { userId?: string; deckId?: string })
    await fulfillJson(route, { id: joinedGameCode })
  })
  // The board behind the hand-off is not what this test is about; only the navigation target matters.
  await page.route(new RegExp(`/api/games/${joinedGameCode}/state$`), (route) => route.abort())

  await seedImportedDeck(page, '1x L-001\n2x N-001')
  await page.goto('/')
  await page.getByLabel('Display Name').fill('Guest One')
  await page.getByRole('radio', { name: 'Join or Host' }).click()
  // The host format list is filled in as soon as the active formats arrive, which is also when the deck can be judged.
  await expect(page.getByRole('combobox', { name: 'Format' })).toContainText(MOCKED_RULESET.name)
  await page.getByLabel('Game Code').fill(joinedGameCode)

  // Once the code resolves, the summary pill follows that table's format and the deck is named by its leader.
  const summary = page.getByTestId('login-deck-summary')
  await expect(summary).toHaveAttribute('data-legal', 'true')
  await expect(page.getByTestId('login-deck-summary-pill')).toHaveText('Legal')
  await expect(summary.locator('span').last()).toHaveText('L-001 Test Leader')

  await page.getByRole('button', { name: 'Join', exact: true }).click()

  await page.waitForURL(new RegExp(`/game/${joinedGameCode}$`))
  expect(joinPayloads).toHaveLength(1)
  expect(joinPayloads[0].deckId).toBe('e2e-deck-id')
  expect(createPayloads).toHaveLength(0)
})

/**
 * The live check the code buys: the deck is judged against the table's own format, and a deck that does not fit it is
 * refused before the join request leaves the browser.
 */
test('joining a coded table refuses a deck that does not fit its format', async ({ page }) => {
  const { createPayloads } = await mockCreateGameNetwork(page)
  const joinedGameCode = 'E2EJN'
  const joinPayloads: unknown[] = []

  await page.route(new RegExp(`/api/games/${joinedGameCode}/join$`), async (route) => {
    joinPayloads.push(route.request().postDataJSON())
    await fulfillJson(route, { id: joinedGameCode })
  })

  // No leader, which the mocked format requires exactly one of.
  await seedImportedDeck(page, '2x N-001')
  await page.goto('/')
  await page.getByLabel('Display Name').fill('Guest One')
  await page.getByRole('radio', { name: 'Join or Host' }).click()
  await page.getByLabel('Game Code').fill(joinedGameCode)

  const summary = page.getByTestId('login-deck-summary')
  await expect(summary).toHaveAttribute('data-legal', 'false')
  await expect(page.getByTestId('login-deck-summary-pill')).toHaveText('Not legal')

  await page.getByRole('button', { name: 'Join', exact: true }).click()

  await expect(
    page.getByText(`This match is played in ${MOCKED_RULESET.name}, and your deck does not fit it.`),
  ).toBeVisible()
  expect(joinPayloads).toHaveLength(0)
  expect(createPayloads).toHaveLength(0)
})
