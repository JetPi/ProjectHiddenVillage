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
    // Opted out of the warm start on purpose: the deck-out profile's opening hand takes the whole deck, so the
    // game over this test asserts *is* the opening. Warming past it would have nothing left to observe.
    const setup = await setupMultiplayerGame(request, 'deck-out', {}, { warmStart: false })
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
      // The reason is worded for the player reading it: the loser reads their own rule defeat, the winner reads the
      // opponent's, instead of one perspective-neutral sentence for both. The copy itself lives in
      // `game.outcome.reason.deckOut.*`.
      await expect(loserPage.getByTestId('game-over-reason')).toHaveText('Lost by deck out.')
      await expect(winnerPage.getByTestId('game-over-reason')).toHaveText('Won by deck out.')

      // The engine publishes no action, no prompt and no support window once the game is over.
      const winnerState = await fetchGameState(request, setup.gameCode, winner.session.accessToken)
      expect(winnerState.availableActions).toHaveLength(0)
      expect(winnerState.pendingPrompt).toBeNull()
      expect(normalizeUserId(winnerState.gameOutcome?.winnerPlayerId ?? '')).toBe(winnerId)

      // Undoing is a live-game affordance, so the sidebar drops it once an outcome exists.
      await expect(loserPage.getByTestId('undo-action-button')).toHaveCount(0)

      // The result no longer traps the board: reviewing it leaves the finished position readable, with the action
      // log still one click away, and leaving is offered at the corner the overlay used to occupy.
      await loserPage.getByTestId('game-over-review-button').click()
      await expect(loserPage.getByTestId('game-over-overlay')).toHaveCount(0)
      await expect(loserPage.getByTestId('game-over-review-return-button')).toBeVisible()

      await loserPage.getByTestId('action-log-toggle').click()
      const reviewLog = loserPage.getByTestId('action-log-panel')
      await expect(reviewLog).toBeVisible()
      await expect(reviewLog.getByTestId('action-log-entry').first()).toBeVisible()

      // Review mode is exactly when the log is worth reading at length: the result overlay is gone, so nothing is
      // left for the expanded panel to bury and the expand control has to work instead of sitting disabled.
      const reviewExpand = reviewLog.getByTestId('action-log-expand')
      await expect(reviewExpand).toBeEnabled()
      await reviewExpand.click()
      await expect(reviewLog).toHaveAttribute('data-mode', 'expanded')

      await loserPage.getByTestId('game-over-review-return-button').click()
      await loserPage.waitForURL((url) => url.pathname === '/')
      await expect(loserPage.getByTestId('game-over-review-return-button')).toHaveCount(0)
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
