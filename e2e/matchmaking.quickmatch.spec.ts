import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'

/**
 * Quick match is exercised with the network mocked on purpose: the ruleset list, the catalog lookups and the
 * matchmaking endpoints are all stubbed, so this spec can use a tiny two-sentence format instead of writing
 * throw-away rulesets and 50-card decks into the shared e2e database. The server-side pairing rules (same-ruleset
 * only, illegal decks refused, ticket expiry, join-by-code enforcement) are covered by the server test suite.
 */

const RULESET_ID = '20000000-0000-0000-0000-0000000000e2'
const MATCHED_GAME_CODE = 'E2EAA'

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
  { id: 'N-002', displayName: 'Another Character', type: 'Character', color: 'Red' },
]

const MOCKED_PRESENCE = {
  onlineViewers: 7,
  waitingByRuleset: [{ rulesetId: RULESET_ID, rulesetName: MOCKED_RULESET.name, waitingCount: 3 }],
  authenticatedViewers: 2,
  anonymousViewers: 5,
}

type MatchmakingMockOptions = {
  /** Ticket state the status endpoint reports. `waiting` keeps the search dialog open. */
  statusState?: 'waiting' | 'matched'
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function mockQuickmatchNetwork(page: Page, options: MatchmakingMockOptions = {}): Promise<{
  queueRequests: number[]
  cancelRequests: string[]
}> {
  const queueRequests: number[] = []
  const cancelRequests: string[] = []
  const enqueuedAtUtc = new Date().toISOString()

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

  await page.route(/\/api\/matchmaking\/queue$/, async (route) => {
    queueRequests.push(1)
    await fulfillJson(route, {
      ticketId: 'ticket-1',
      rulesetId: RULESET_ID,
      rulesetName: MOCKED_RULESET.name,
      state: 'waiting',
      gameId: null,
      opponentName: null,
      enqueuedAtUtc,
    })
  })

  await page.route(/\/api\/matchmaking\/queue\/[^/]+$/, async (route) => {
    const method = route.request().method()

    if (method === 'DELETE') {
      cancelRequests.push(route.request().url())
      await fulfillJson(route, {
        ticketId: 'ticket-1',
        rulesetId: RULESET_ID,
        rulesetName: MOCKED_RULESET.name,
        state: 'cancelled',
        gameId: null,
        opponentName: null,
        enqueuedAtUtc,
      })
      return
    }

    const state = options.statusState ?? 'waiting'
    await fulfillJson(route, {
      ticketId: 'ticket-1',
      rulesetId: RULESET_ID,
      rulesetName: MOCKED_RULESET.name,
      state,
      gameId: state === 'matched' ? MATCHED_GAME_CODE : null,
      opponentName: state === 'matched' ? 'Guest Two' : null,
      enqueuedAtUtc,
    })
  })

  return { queueRequests, cancelRequests }
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

async function submitQuickmatch(page: Page, deckText: string): Promise<void> {
  await seedImportedDeck(page, deckText)
  await page.goto('/')
  await page.getByLabel('Display Name').fill('Guest One')
  await page.getByRole('button', { name: 'Enter Game' }).click()
}

test('quick match queues under the selected format and joins the matched game', async ({ page }) => {
  const { queueRequests } = await mockQuickmatchNetwork(page, { statusState: 'matched' })

  await page.goto('/')

  // The quick-match combo shows the format the active rulesets provide, not a game code.
  await expect(page.getByRole('combobox', { name: 'Game Code' })).toHaveText(MOCKED_RULESET.name)
  // Everyone with the site open is counted, in a game or not.
  await expect(page.getByTestId('online-players')).toHaveText('7 players online')

  await submitQuickmatch(page, '1x L-001\n2x N-001')

  // The polled ticket sends the player into the matched game as soon as it reports matched.
  await page.waitForURL(new RegExp(`/game/${MATCHED_GAME_CODE}$`))
  expect(queueRequests).toHaveLength(1)
})

test('quick match refuses a deck that does not fit the selected format without queueing', async ({ page }) => {
  const { queueRequests } = await mockQuickmatchNetwork(page, { statusState: 'matched' })

  // No leader: the mocked format requires exactly one.
  await submitQuickmatch(page, '2x N-001')

  await expect(
    page.getByText('This deck is not legal in E2E Format. Fix the issues shown and try again.'),
  ).toBeVisible()
  expect(queueRequests).toHaveLength(0)
})

test('the search dialog shows the wait and cancelling it releases the ticket', async ({ page }) => {
  const { cancelRequests } = await mockQuickmatchNetwork(page, { statusState: 'waiting' })

  await submitQuickmatch(page, '1x L-001\n2x N-001')

  const searchDialog = page.getByRole('dialog', { name: /Searching for a E2E Format opponent/ })
  await expect(searchDialog).toBeVisible()
  await expect(page.getByTestId('matchmaking-elapsed')).toBeVisible()
  // Queue depth for the format being searched comes from the same presence snapshot.
  await expect(page.getByTestId('matchmaking-waiting-players')).toHaveText(
    '3 players are queued for this format.',
  )

  await page.getByTestId('matchmaking-cancel').click()

  await expect(searchDialog).toBeHidden()
  expect(cancelRequests).toHaveLength(1)
})
