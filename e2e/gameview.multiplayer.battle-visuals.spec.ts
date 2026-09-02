import { expect, test } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  executeBattleActionViaHub,
  fetchGameState,
  openMultiplayerPages,
  resolveActorWithBottomBattleAction,
  resolveActorWithBottomHandAction,
  resolveAllMulliganPrompts,
  resolveBattleActionForSpecificCard,
  resolvePlayerState,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

test.describe('GameView multiplayer battle visuals', () => {
  test.describe.configure({ timeout: 120_000 })

  test('battle action click enters target selection mode with highlight classes and hidden target preview icons', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
      const summonCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return actorState.characterField.some((card) => card.instanceId === summonActor.cardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const battleActor = await resolveActorWithBottomBattleAction(request, setup, pages)
      const battleCard = battleActor.actorPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${battleActor.cardInstanceId}"]`)

      await expect(battleCard).toBeVisible()
      await battleCard.hover()
      await battleCard.getByRole('button', { name: new RegExp(`^${battleActor.actionLabel}$`, 'i') }).click()

      await expect(battleActor.actorPage.getByRole('button', { name: /cancel attack target selection/i })).toBeVisible({ timeout: 8_000 })

      await expect.poll(async () => {
        return await battleActor.actorPage
          .locator('.battle-target-top, .battle-target-bottom, .battle-target-leader-top, .battle-target-leader-bottom')
          .count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)

      await expect.poll(async () => {
        return await battleActor.actorPage
          .locator(
            '.battle-target-top [aria-label="Open card details"], '
            + '.battle-target-bottom [aria-label="Open card details"], '
            + '.battle-target-leader-top [aria-label="Open leader card details"], '
            + '.battle-target-leader-bottom [aria-label="Open leader card details"]',
          )
          .count()
      }, {
        timeout: 8_000,
      }).toBe(0)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('refresh during pending attack keeps attacker rested from backend state', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
      const summonCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return actorState.characterField.some((card) => card.instanceId === summonActor.cardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const battleActor = await resolveBattleActionForSpecificCard(
        request,
        setup,
        pages,
        summonActor.actor,
        summonActor.cardInstanceId,
      )

      const selectedTarget = await executeBattleActionViaHub(
        setup.gameCode,
        battleActor.actor,
        battleActor.actionId,
        battleActor.cardInstanceId,
      )

      await expect.poll(async () => {
        return await battleActor.actorPage.locator('#attack-link-overlay').count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)

      await expect.poll(async () => {
        return await battleActor.actorPage.locator('#attack-link-overlay svg path').count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, battleActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, battleActor.actor)
        const attackerCard = actorState.characterField.find((card) => card.instanceId === battleActor.cardInstanceId)

        return {
          found: Boolean(attackerCard),
          hasRestFlag: attackerCard ? Object.prototype.hasOwnProperty.call(attackerCard, 'isRested') : false,
          isRested: attackerCard?.isRested ?? false,
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        found: true,
        hasRestFlag: true,
        isRested: true,
      })

      await battleActor.actorPage.reload()
      await expect(battleActor.actorPage.getByTestId('game-board')).toBeVisible()

      const attackerAfterReload = battleActor.actorPage.locator(
        `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${battleActor.cardInstanceId}"]`,
      )
      const targetAfterReload = battleActor.actorPage.locator(
        `[data-card-instance-id="${selectedTarget.targetCardInstanceId}"]`,
      )

      await expect(attackerAfterReload).toBeVisible()
      await expect(targetAfterReload).toBeVisible()
      await expect.poll(async () => {
        return await battleActor.actorPage.locator('#attack-link-overlay').count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)

      await expect.poll(async () => {
        return await attackerAfterReload.getAttribute('class')
      }, {
        timeout: 8_000,
      }).toContain('rotate-[14deg]')

      await expect.poll(async () => {
        return await attackerAfterReload.getAttribute('class')
      }, {
        timeout: 8_000,
      }).toContain('attack-link-card-outline')

      await expect.poll(async () => {
        const targetClassName = await targetAfterReload.getAttribute('class')
        return Boolean(
          targetClassName?.includes('attack-link-card-outline')
          || targetClassName?.includes('attack-link-leader-outline'),
        )
      }, {
        timeout: 8_000,
      }).toBe(true)

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, battleActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, battleActor.actor)
        const attackerCard = actorState.characterField.find((card) => card.instanceId === battleActor.cardInstanceId)

        return {
          found: Boolean(attackerCard),
          hasRestFlag: attackerCard ? Object.prototype.hasOwnProperty.call(attackerCard, 'isRested') : false,
          isRested: attackerCard?.isRested ?? false,
        }
      }, {
        timeout: 8_000,
      }).toEqual({
        found: true,
        hasRestFlag: true,
        isRested: true,
      })
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
