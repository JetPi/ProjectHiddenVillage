import { expect, test } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  fetchGameState,
  openMultiplayerPages,
  resolveActorWithLeaderBattleAction,
  resolveAllMulliganPrompts,
  resolvePlayerState,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test.describe('GameView multiplayer leader battle actions', () => {
  test.describe.configure({ timeout: 180_000 })

  // Regression guard: battle actions are published per card (`battle-action:{instanceId}`) - battlefield
  // cards and leaders alike - and never in the global action list. The store prunes pending interaction
  // state on every store/state pass, so if the leader is not part of the battle source scope the freshly
  // declared attack is deleted the instant it opens and the board never prompts for a target.
  test('leader Battle action enters target selection mode, survives the state push and resolves through Choose', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')
      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const battleActor = await resolveActorWithLeaderBattleAction(request, setup, pages)

      const leaderCard = battleActor.actorPage.locator('[data-zone="leader-card"][data-slot-side="bottom"]')
      await expect(leaderCard).toBeVisible({ timeout: 15_000 })
      await leaderCard.hover()

      const battleButton = leaderCard.getByRole('button', { name: new RegExp(`^${battleActor.actionLabel}$`, 'i') })
      await expect(battleButton).toBeEnabled({ timeout: 10_000 })
      await battleButton.click()

      const cancelChip = battleActor.actorPage.getByTestId('cancel-target-mode-button')
      await expect(cancelChip).toBeVisible({ timeout: 10_000 })

      // Wait a beat so the store's prune actually runs, then assert the mode is still open.
      await wait(600)
      await expect(cancelChip).toBeVisible()

      await expect(
        battleActor.actorPage
          .locator('.battle-target-top, .battle-target-bottom, .battle-target-leader-top, .battle-target-leader-bottom')
          .first(),
      ).toBeVisible({ timeout: 10_000 })

      // The opposing leader is always a valid target; choosing it confirms the same submit path the
      // battlefield rows use (Choose button -> onSelectAttackTarget).
      const opposingLeader = battleActor.actorPage.locator('[data-zone="leader-card"][data-slot-side="top"]')
      await expect(opposingLeader).toBeVisible({ timeout: 10_000 })
      await opposingLeader.hover()

      const chooseButton = opposingLeader.getByRole('button', { name: /^choose$/i })
      await expect(chooseButton).toBeVisible({ timeout: 10_000 })
      await chooseButton.click()

      // The attack-link arrow is derived from backend pending-attack state; it must treat the leader
      // as a valid attacker source, otherwise leader-declared attacks render no arrow.
      await expect.poll(async () => {
        return await battleActor.actorPage.locator('#attack-link-overlay').count()
      }, { timeout: 10_000 }).toBeGreaterThan(0)

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, battleActor.actor.session.accessToken)
        return resolvePlayerState(state, battleActor.actor).leader.isRested === true
      }, { timeout: 15_000 }).toBe(true)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
