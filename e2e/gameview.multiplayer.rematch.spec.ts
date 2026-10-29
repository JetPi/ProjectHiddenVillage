import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  fetchGameState,
  openMultiplayerPages,
  progressToNextDecisionWindow,
  resolveAllMulliganPrompts,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'
import type { GameOutcomeResponse, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'
import { API_BASE_URL } from './helpers/multiplayer/api'

type PendingRematch = {
  requestId: string
  requestedByPlayerId: string
  acceptedByPlayerId: string | null
  declinedByPlayerId: string | null
  expiresAtUtc: string
  reservedCode: string | null
  rulesetName: string | null
}

type GameStateWithRematch = Awaited<ReturnType<typeof fetchGameState>> & {
  pendingRematch?: PendingRematch | null
}

/** The grace a release waits out, plus one sweeper tick - the window before a departure is applied server side. */
const RELEASE_WINDOW_MS = 35_000

/**
 * A rematch is agreed on the finished board and then claimed from the login view, which is where each player picks
 * the deck they bring to the next match. The `deck-out` profile ends the game inside the first turn, so these specs
 * reach the result without playing a real game and can spend their time on the handshake itself:
 *
 * - the offer travels in the state payload, so both boards see it;
 * - accepting reserves a table whose code answers the ruleset pre-check before the table exists;
 * - agreeing is the whole interaction: both players are taken to the login view with the code in the form;
 * - claiming it opens the table, and the board stays put instead of bouncing back;
 * - and a player who leaves takes the rematch with them: the opponent's banner is cleared when they come back to the
 *   tab, because the reservation is released rather than left to sit out its half hour.
 */
test.describe('GameView multiplayer rematch', () => {
  test.describe.configure({ timeout: 150_000 })

  test('both players agree, are handed to the login view and claim the reserved table', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'deck-out', {}, { warmStart: false })
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const { winnerPage, loserPage, winner } = await driveToAgreedRematch(request, setup, pages)
      const reservedCode = await waitForReservedCode(request, setup, winner.session.accessToken)

      await expect(winnerPage.getByTestId('login-rematch-banner')).toBeVisible({ timeout: 30_000 })
      await expect(loserPage.getByTestId('login-rematch-banner')).toBeVisible({ timeout: 30_000 })
      await expect(winnerPage.locator('#joinGameCode')).toHaveValue(reservedCode)
      await expect(loserPage.locator('#joinGameCode')).toHaveValue(reservedCode)

      // The code answers the join form's format pre-check before any table exists under it, so a deck can be
      // judged before it is claimed.
      const rulesetResponse = await request.get(`${API_BASE_URL}/api/games/${reservedCode}/ruleset`)
      expect(rulesetResponse.ok()).toBe(true)

      // Claiming the table is the step that used to bounce: the new board rendered with the *finished* game's state
      // for one frame, so the rematch hand-off fired again and sent the player straight back here.
      //
      // A starter deck is used because it is public: the claim then does not depend on which seeded user won, and
      // the picker is driven exactly as a player drives it.
      await claimReservedTable(winnerPage)

      await winnerPage.waitForURL((url) => url.pathname === `/game/${reservedCode}`, { timeout: 30_000 })

      // ...and the board stays put. A bounce shows up as the login view again a moment later, so time is the
      // assertion here, not just the URL right after the redirect.
      await winnerPage.waitForTimeout(2_000)
      await expect(winnerPage).toHaveURL(new RegExp(`/game/${reservedCode}$`))
      await expect(winnerPage.getByTestId('login-rematch-banner')).toHaveCount(0)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('a player who leaves releases the rematch for the opponent', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'deck-out', {}, { warmStart: false })
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const { winnerPage, loserPage, winner } = await driveToAgreedRematch(request, setup, pages)
      const reservedCode = await waitForReservedCode(request, setup, winner.session.accessToken)

      await expect(winnerPage.getByTestId('login-rematch-banner')).toBeVisible({ timeout: 30_000 })

      // The loser walks away from the login view instead of claiming a seat. The release is deferred, so nothing
      // happens immediately - that is the window a refresh lives in.
      await loserPage.goto('/sign-in')

      // The winner comes back to the tab after the grace and the sweep: the banner is cleared by the probe rather
      // than by a timer, which is the whole no-polling rule.
      await winnerPage.waitForTimeout(RELEASE_WINDOW_MS)
      await winnerPage.evaluate(() => {
        window.dispatchEvent(new Event('focus'))
      })

      await expect(winnerPage.getByTestId('login-rematch-banner')).toHaveCount(0, { timeout: 30_000 })

      // And the code is no longer reserved for anybody: the reservation was dropped, not merely hidden.
      const probe = await request.get(`${API_BASE_URL}/api/games/${reservedCode}/ruleset`)
      expect(probe.status()).toBeGreaterThanOrEqual(400)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})

/**
 * Plays the seeded deck-out game to its result and walks both players through the offer and the acceptance, leaving
 * them on the login view. Returns the pages and the winner's identity, since which page is which depends on who lost.
 */
async function driveToAgreedRematch(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: Awaited<ReturnType<typeof openMultiplayerPages>>,
): Promise<{
  winnerPage: Page
  loserPage: Page
  winner: MultiplayerSetup['playerOne']
  loser: MultiplayerSetup['playerOne']
  isPlayerOneTheLoser: boolean
}> {
  const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
  await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

  await advanceToMulliganPromptIfNeeded(request, setup)
  await resolveAllMulliganPrompts(request, setup, 'noMulligan')

  const outcome = await waitForGameOutcome(request, setup)
  const loserId = outcome.loserPlayerIds[0]?.replace(/-/g, '').toLowerCase()
  const isPlayerOneTheLoser = setup.playerOne.userId.replace(/-/g, '').toLowerCase() === loserId

  const loserPage = isPlayerOneTheLoser ? pages.playerOnePage : pages.playerTwoPage
  const winnerPage = isPlayerOneTheLoser ? pages.playerTwoPage : pages.playerOnePage
  const winner = isPlayerOneTheLoser ? setup.playerTwo : setup.playerOne
  const loser = isPlayerOneTheLoser ? setup.playerOne : setup.playerTwo

  await expect(winnerPage.getByTestId('game-over-overlay')).toBeVisible({ timeout: 30_000 })
  await expect(loserPage.getByTestId('game-over-overlay')).toBeVisible({ timeout: 30_000 })

  // The winner offers; the opponent sees the offer arrive on their own finished board.
  await winnerPage.getByTestId('rematch-offer-button').click()
  await expect(winnerPage.getByTestId('rematch-waiting-note')).toBeVisible({ timeout: 30_000 })
  await expect(loserPage.getByTestId('rematch-accept-button')).toBeVisible({ timeout: 30_000 })

  await loserPage.getByTestId('rematch-accept-button').click()

  // Agreeing is the whole interaction: both players are taken off the finished board.
  await winnerPage.waitForURL((url) => url.pathname === '/', { timeout: 30_000 })
  await loserPage.waitForURL((url) => url.pathname === '/', { timeout: 30_000 })

  return { winnerPage, loserPage, winner, loser, isPlayerOneTheLoser }
}

async function waitForReservedCode(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  accessToken: string,
): Promise<string> {
  const state = (await fetchGameState(request, setup.gameCode, accessToken)) as GameStateWithRematch
  const reservedCode = state.pendingRematch?.reservedCode ?? null

  expect(reservedCode).toMatch(/^[A-Za-z0-9]{5}$/)

  return reservedCode!
}

/** Picks a public starter deck and presses Join - the two interactions a player makes to claim the reserved table. */
async function claimReservedTable(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Starter Decks' }).click()

  const deckPicker = page.getByRole('combobox', { name: 'Deck Options' })

  // The public list arrives after the panel renders, so the control is only worth driving once it has options.
  await expect.poll(async () => {
    await deckPicker.click()
    const optionCount = await page.getByRole('listbox').getByRole('option').count()
    await page.keyboard.press('Escape')
    return optionCount
  }, { timeout: 30_000 }).toBeGreaterThan(0)

  await deckPicker.click()
  await page.getByRole('listbox').getByRole('option').first().click()

  await page.getByRole('button', { name: 'Join', exact: true }).click()
}

/** Drives the game forward until the server publishes the outcome, then returns it. */
async function waitForGameOutcome(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<GameOutcomeResponse> {
  for (let cycle = 0; cycle < 120; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    if (playerOneState.gameOutcome) {
      return playerOneState.gameOutcome
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error('The server never published a game outcome for the deck-out scenario.')
}
