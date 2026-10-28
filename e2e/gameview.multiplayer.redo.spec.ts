import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  closeMultiplayerPages,
  fetchGameState,
  openMultiplayerPages,
  resolveActorWithBottomHandAction,
  resolvePlayerState,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

/**
 * Taking a move back is bilateral: the requester waits, the opponent answers, and only an approval moves the board.
 * These specs drive the real board, so they also pin that the consent UI appears on the side that has to answer.
 */
test.describe('GameView multiplayer redo', () => {
  test.describe.configure({ timeout: 120_000 })

  test('a declined redo leaves the board alone and records both halves', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
      const ownerPage = summonActor.actorPage
      const opponentPage = resolveOpponentPage(summonActor.actor.userId, setup, pages)
      const summonCardInstanceId = summonActor.cardInstanceId

      await summonCard(ownerPage, summonCardInstanceId)

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        return resolvePlayerState(state, summonActor.actor).characterField.some(
          (card) => card.instanceId === summonCardInstanceId,
        )
      }, {
        timeout: 12_000,
      }).toBe(true)

      const redoButton = ownerPage.locator('[data-testid="undo-action-button"]')
      // The control is labelled, not showing a raw translation key: a missing namespace on this screen would
      // otherwise only be visible to a human looking at the board.
      await expect(redoButton).toHaveAttribute('aria-label', 'Ask to take the last move back')
      await expect(redoButton).toBeEnabled({ timeout: 12_000 })
      await redoButton.click()

      const waitingBanner = ownerPage.locator('[data-testid="redo-waiting-banner"]')
      await expect(waitingBanner).toBeVisible()
      await expect(waitingBanner).toContainText('Waiting for your opponent')

      const consentDialog = opponentPage.locator('[data-testid="redo-consent-dialog"]')
      await expect(consentDialog).toBeVisible({ timeout: 12_000 })
      await expect(consentDialog).toContainText('Take the move back?')
      await expect(consentDialog).toContainText('Both players have to agree before the board goes back.')
      await expect(opponentPage.locator('[data-testid="redo-decline-button"]')).toHaveText('Keep playing')
      await expect(opponentPage.locator('[data-testid="redo-accept-button"]')).toHaveText('Agree')

      // The question owns the upper half of the viewport: the turn banner and the phase row sit below it, never
      // over it.
      const dialogBox = await consentDialog.boundingBox()
      const viewport = opponentPage.viewportSize()
      expect(dialogBox).not.toBeNull()
      expect(viewport).not.toBeNull()
      if (dialogBox && viewport) {
        expect(dialogBox.y).toBeLessThan(viewport.height / 2)
      }

      await opponentPage.locator('[data-testid="redo-decline-button"]').click()

      await expect(consentDialog).toBeHidden()
      await expect(ownerPage.locator('[data-testid="redo-waiting-banner"]')).toBeHidden()

      const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
      const redoView = asRedoView(state)

      expect(resolvePlayerState(state, summonActor.actor).characterField.some(
        (card) => card.instanceId === summonCardInstanceId,
      )).toBe(true)
      expect(redoView.pendingRedo ?? null).toBeNull()
      expect(redoView.lastRewindId ?? null).toBeNull()

      const actionTypes = (redoView.actionLog ?? []).map((entry) => entry.actionType)
      expect(actionTypes).toContain('redo_requested')
      expect(actionTypes).toContain('redo_declined')
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('an accepted redo puts the summoned card back, and a second acceptance steps further back', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
      const ownerPage = summonActor.actorPage
      const opponentPage = resolveOpponentPage(summonActor.actor.userId, setup, pages)
      const summonCardInstanceId = summonActor.cardInstanceId

      await summonCard(ownerPage, summonCardInstanceId)

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        return resolvePlayerState(state, summonActor.actor).characterField.some(
          (card) => card.instanceId === summonCardInstanceId,
        )
      }, {
        timeout: 12_000,
      }).toBe(true)

      const redoButton = ownerPage.locator('[data-testid="undo-action-button"]')
      await expect(redoButton).toBeEnabled({ timeout: 12_000 })
      await redoButton.click()

      const consentDialog = opponentPage.locator('[data-testid="redo-consent-dialog"]')
      await expect(consentDialog).toBeVisible({ timeout: 12_000 })
      await opponentPage.locator('[data-testid="redo-accept-button"]').click()
      await expect(consentDialog).toBeHidden()

      // The summon is undone: the card is back in the hand it was played from.
      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)

        return actorState.hand.some((card) => card.instanceId === summonCardInstanceId)
          && !actorState.characterField.some((card) => card.instanceId === summonCardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const afterFirstRewind = asRedoView(
        await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken),
      )
      expect(afterFirstRewind.lastRewindId ?? null).not.toBeNull()
      expect((afterFirstRewind.actionLog ?? []).map((entry) => entry.actionType)).toContain('redo_accepted')

      // A second approval is possible because the restored board still has a moment behind it, and it lands the
      // board somewhere else again: one approval consumes one rewind point.
      await expect(redoButton).toBeEnabled({ timeout: 12_000 })
      await redoButton.click()
      await expect(consentDialog).toBeVisible({ timeout: 12_000 })
      await opponentPage.locator('[data-testid="redo-accept-button"]').click()
      await expect(consentDialog).toBeHidden()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        return asRedoView(state).lastRewindId ?? null
      }, {
        timeout: 12_000,
      }).not.toBe(afterFirstRewind.lastRewindId)

      const finalState = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
      expect(resolvePlayerState(finalState, summonActor.actor).characterField.some(
        (card) => card.instanceId === summonCardInstanceId,
      )).toBe(false)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})

type RedoView = {
  pendingRedo?: { requestId: string } | null
  lastRewindId?: string | null
  actionLog?: Array<{ actionType: string }>
}

/**
 * The shared state type predates the redo fields. Casting keeps this spec from widening a helper every suite depends
 * on, while still reading the wire fields it is here to assert.
 */
function asRedoView(state: unknown): RedoView {
  return state as RedoView
}

function resolveOpponentPage(
  actorUserId: string,
  setup: { playerOne: { userId: string } },
  pages: { playerOnePage: Page; playerTwoPage: Page },
): Page {
  return actorUserId === setup.playerOne.userId ? pages.playerTwoPage : pages.playerOnePage
}

async function summonCard(ownerPage: Page, cardInstanceId: string): Promise<void> {
  const card = ownerPage.locator(`[data-testid="bottom-hand-card-${cardInstanceId}"]`)
  await card.hover()
  await card.getByRole('button', { name: /^summon$/i }).click()
}
