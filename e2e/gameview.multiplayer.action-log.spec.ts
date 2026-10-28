import { expect, test } from '@playwright/test'
import {
  closeMultiplayerPages,
  openMultiplayerPages,
  resolveActorWithBottomHandAction,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// N-007 (Minato) is a plain normal-summonable Character with no on-summon prompt, so the summon is a single,
// predictable action - which is exactly what the log has to record.
const SUMMONABLE_CHARACTER_CARD_DEFINITION_ID = 'N-007'

test.describe('GameView multiplayer action log', () => {
  test.describe.configure({ timeout: 240_000 })

  test('opens from the sidebar, records a summon and collapses on an outside click', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const summonActor = await resolveActorWithBottomHandAction(
        request,
        setup,
        pages,
        'Summon',
        { cardDefinitionId: SUMMONABLE_CHARACTER_CARD_DEFINITION_ID },
      )

      // The helper only resolves who may act and with what; the summon itself is the click below.
      const summonCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      const actorPage = summonActor.actorPage
      const gameBoard = actorPage.locator('[data-testid="game-board"]')

      // Let the summon's arrival animation finish: it briefly overlays the board, and measuring mid-flight would
      // compare two different layout moments instead of closed-versus-open panel.
      await wait(800)

      const boardBefore = await gameBoard.boundingBox()
      expect(boardBefore).not.toBeNull()

      const logToggle = actorPage.locator('[data-testid="action-log-toggle"]')
      // Reading the log is not a game action, so the control is never gated by the action lock.
      await expect(logToggle).toBeEnabled()
      await logToggle.click()

      const panel = actorPage.locator('[data-testid="action-log-panel"]')
      await expect(panel).toBeVisible()
      await expect(panel).toHaveAttribute('data-mode', 'compact')

      // The compact panel is an overlay beside the board: it must not resize the board, whose geometry the attack
      // links and card flights are anchored to.
      const boardAfterOpen = await gameBoard.boundingBox()
      expect(boardAfterOpen).not.toBeNull()
      expect(Math.round(boardAfterOpen!.width)).toBe(Math.round(boardBefore!.width))
      expect(Math.round(boardAfterOpen!.height)).toBe(Math.round(boardBefore!.height))

      const summonEntry = panel
        .locator('[data-testid="action-log-entry"][data-action-type="card_summoned"]')
        .last()
      await expect(summonEntry).toBeVisible()
      await expect(summonEntry).toContainText(/summoned/i)

      // Expanding is the panel's own affordance. An outside click returns it to the compact column - the log stays
      // open, because only the board's button closes it.
      await panel.locator('[data-testid="action-log-expand"]').click()
      await expect(panel).toHaveAttribute('data-mode', 'expanded')

      await actorPage.mouse.click(8, 8)
      await expect(panel).toHaveAttribute('data-mode', 'compact')
      await expect(panel).toBeVisible()

      await panel.locator('[data-testid="action-log-close"]').click()
      await expect(panel).toBeHidden()
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
