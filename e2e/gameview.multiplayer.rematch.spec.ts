import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
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

/**
 * A rematch is agreed on the finished board and then claimed from the login view, which is where each player picks
 * the deck they bring to the next match. The `deck-out` profile ends the game inside the first turn, so this spec
 * reaches the result without playing a real game and can spend its time on the handshake itself:
 *
 * - the offer travels in the state payload, so both boards see it (waiting note for the requester, accept/decline
 *   for the opponent);
 * - accepting reserves a table: the state then carries a code that answers the ruleset pre-check even though no
 *   table exists yet;
 * - "Choose a deck and rejoin" takes the player back to the login view with that code already filled in.
 */
test.describe('GameView multiplayer rematch', () => {
  test.describe.configure({ timeout: 120_000 })

  test('both players agree on another match and land on the reserved code', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'deck-out', {}, { warmStart: false })
    const pages = await openMultiplayerPages(browser, setup)

    try {
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

      await expect(loserPage.getByTestId('rematch-reserved-note')).toBeVisible({ timeout: 30_000 })
      await expect(winnerPage.getByTestId('rematch-reserved-note')).toBeVisible({ timeout: 30_000 })
      await expect(winnerPage.getByTestId('rematch-rejoin-button')).toBeVisible()

      // The reserved code is published on both sides: it is the table both players are about to claim.
      const winnerState = (await fetchGameState(
        request,
        setup.gameCode,
        winner.session.accessToken,
      )) as GameStateWithRematch
      const loserState = (await fetchGameState(
        request,
        setup.gameCode,
        loser.session.accessToken,
      )) as GameStateWithRematch

      const reservedCode = winnerState.pendingRematch?.reservedCode ?? null
      expect(reservedCode).toMatch(/^[A-Za-z0-9]{5}$/)
      expect(loserState.pendingRematch?.reservedCode).toBe(reservedCode)
      expect(winnerState.pendingRematch?.acceptedByPlayerId).toBeTruthy()

      // The code answers the join form's format pre-check before any table exists under it, so a deck can be
      // judged before it is claimed.
      const rulesetResponse = await request.get(`${API_BASE_URL}/api/games/${reservedCode}/ruleset`)
      expect(rulesetResponse.ok()).toBe(true)

      // "Choose a deck and rejoin" leaves the finished board for the login view, with the code already in the form.
      await winnerPage.getByTestId('rematch-rejoin-button').click()
      await winnerPage.waitForURL((url) => url.pathname === '/')

      await expect(winnerPage.getByTestId('login-rematch-banner')).toBeVisible({ timeout: 30_000 })
      await expect(winnerPage.locator('#joinGameCode')).toHaveValue(reservedCode!)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})

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
