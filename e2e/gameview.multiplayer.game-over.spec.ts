import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  fetchGameState,
  normalizeUserId,
  openMultiplayerPages,
  progressToNextDecisionWindow,
  resolveAllMulliganPrompts,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'
import type { GameOutcomeResponse, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'

/**
 * The `deck-out` seed profile gives each player a leader plus exactly five characters, so the opening hand
 * takes the whole deck and the first DrawPhase has to draw from an empty deck: "if a player has to draw a
 * card but their deck has no cards left, the other player wins". That ends the game inside the very first
 * turn, which is what lets this spec observe the result without playing a real game.
 *
 * Both players must see the overlay (Victory for the winner, Defeat for the loser), the engine must publish
 * no interaction at all once the outcome exists, and "Return to main page" must leave the game route.
 */
test.describe('GameView multiplayer game over', () => {
  test.describe.configure({ timeout: 120_000 })

  test('both players see the result overlay and can return to the main page', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'deck-out')
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const outcome = await waitForGameOutcome(request, setup)
      expect(outcome.reason).toBe('DeckOut')
      expect(outcome.loserPlayerIds).toHaveLength(1)
      expect(outcome.winnerPlayerId).toBeTruthy()

      const loserId = normalizeUserId(outcome.loserPlayerIds[0])
      const winnerId = normalizeUserId(outcome.winnerPlayerId!)
      const isPlayerOneTheLoser = normalizeUserId(setup.playerOne.userId) === loserId

      const loserPage = isPlayerOneTheLoser ? pages.playerOnePage : pages.playerTwoPage
      const winnerPage = isPlayerOneTheLoser ? pages.playerTwoPage : pages.playerOnePage
      const winner = isPlayerOneTheLoser ? setup.playerTwo : setup.playerOne

      await expect(loserPage.getByTestId('game-over-overlay')).toBeVisible({ timeout: 30_000 })
      await expect(winnerPage.getByTestId('game-over-overlay')).toBeVisible({ timeout: 30_000 })

      await expect(loserPage.getByTestId('game-over-headline')).toHaveText('Defeat')
      await expect(winnerPage.getByTestId('game-over-headline')).toHaveText('Victory')
      await expect(loserPage.getByTestId('game-over-reason')).toHaveText('A player ran out of cards to draw.')

      // The engine publishes no action, no prompt and no support window once the game is over, so the loser
      // has nothing left to click but the overlay's "Return to main page" button.
      const winnerState = await fetchGameState(request, setup.gameCode, winner.session.accessToken)
      expect(winnerState.availableActions).toHaveLength(0)
      expect(winnerState.pendingPrompt).toBeNull()
      expect(normalizeUserId(winnerState.gameOutcome?.winnerPlayerId ?? '')).toBe(winnerId)

      await loserPage.getByTestId('game-over-return-button').click()
      await loserPage.waitForURL((url) => url.pathname === '/')
      await expect(loserPage.getByTestId('game-over-overlay')).toHaveCount(0)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})

/**
 * Drives the game forward with the hub (the clients' own auto-advance may already have done it) until the
 * server publishes the outcome, then returns it.
 */
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
