import { expect, test } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  fetchGameState,
  getCardActionTargetsViaHub,
  getAnimationCount,
  getBottomBattlefieldInstanceOrder,
  getBottomSupportCardsBySlot,
  installAnimationCounter,
  openMultiplayerPages,
  resolveActorWithBottomHandAction,
  resolveAllMulliganPrompts,
  resolvePlayerHandActionWithoutReload,
  resolvePlayerState,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

test.describe('GameView multiplayer actions', () => {
  test.describe.configure({ timeout: 120_000 })

  test('summon transition animates and appends to rightmost battlefield slot', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
      const ownerPage = summonActor.actorPage
      const summonCardInstanceId = summonActor.cardInstanceId

      await installAnimationCounter(ownerPage)
      const initialAnimationCount = await getAnimationCount(ownerPage)
      const initialBattlefieldOrder = await getBottomBattlefieldInstanceOrder(ownerPage)

      const summonCard = ownerPage.locator(`[data-testid="bottom-hand-card-${summonCardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return actorState.characterField.some((card) => card.instanceId === summonCardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      await expect.poll(async () => {
        return await getBottomBattlefieldInstanceOrder(ownerPage)
      }, {
        timeout: 12_000,
      }).toHaveLength(initialBattlefieldOrder.length + 1)

      const finalBattlefieldOrder = await getBottomBattlefieldInstanceOrder(ownerPage)
      expect(finalBattlefieldOrder[finalBattlefieldOrder.length - 1]).toBe(summonCardInstanceId)

      await expect.poll(async () => {
        return await getAnimationCount(ownerPage)
      }, {
        timeout: 6_000,
      }).toBeGreaterThan(initialAnimationCount)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('set support requires slot selection and places card in selected slot with animation', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const supportActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Set Support')
      const ownerPage = supportActor.actorPage
      const supportCardInstanceId = supportActor.cardInstanceId

      await installAnimationCounter(ownerPage)
      const initialAnimationCount = await getAnimationCount(ownerPage)

      const initialSupportCards = await getBottomSupportCardsBySlot(ownerPage)
      const occupiedSlots = new Set(initialSupportCards.map((entry) => entry.slotIndex))
      const emptySlotIndex = [0, 1, 2, 3, 4].find((slotIndex) => !occupiedSlots.has(slotIndex))

      expect(typeof emptySlotIndex).toBe('number')
      if (typeof emptySlotIndex !== 'number') {
        return
      }

      const supportCard = ownerPage.locator(`[data-testid="bottom-hand-card-${supportCardInstanceId}"]`)
      await supportCard.hover()
      await supportCard.getByRole('button', { name: /^set support$/i }).click()

      await expect.poll(async () => {
        return (await getBottomSupportCardsBySlot(ownerPage)).length
      }, {
        timeout: 2_000,
      }).toBe(initialSupportCards.length)

      await ownerPage.locator(`button[data-zone="support"][data-slot-side="bottom"][data-slot-index="${emptySlotIndex}"]`).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, supportActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, supportActor.actor)
        return actorState.supportZone.some((card) => card.instanceId === supportCardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      await expect.poll(async () => {
        return await getBottomSupportCardsBySlot(ownerPage)
      }, {
        timeout: 12_000,
      }).toEqual(expect.arrayContaining([
        {
          slotIndex: emptySlotIndex,
          instanceId: supportCardInstanceId,
        },
      ]))

      await expect.poll(async () => {
        return await getAnimationCount(ownerPage)
      }, {
        timeout: 6_000,
      }).toBeGreaterThan(initialAnimationCount)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('joining player receives card options without manual reload', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const playerTwoAction = await resolvePlayerHandActionWithoutReload(request, setup, setup.playerTwo)
      const playerTwoCard = pages.playerTwoPage.locator(`[data-testid="bottom-hand-card-${playerTwoAction.cardInstanceId}"]`)

      await expect(playerTwoCard).toBeVisible()
      await playerTwoCard.hover()

      await expect(playerTwoCard.getByRole('button', { name: new RegExp(`^${playerTwoAction.actionLabel}$`, 'i') })).toBeVisible({ timeout: 10_000 })
      await expect(playerTwoCard.getByRole('button', { name: new RegExp(`^${playerTwoAction.actionLabel}$`, 'i') })).toBeEnabled()
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('summon requirement card requires tribute selection before summoning', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'summon-requirements')
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const tributeSetupActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: 'T-100',
      })
      const tributeSetupPage = tributeSetupActor.actorPage

      const tributeMaterialCard = tributeSetupPage.locator(`[data-testid="bottom-hand-card-${tributeSetupActor.cardInstanceId}"]`)
      await tributeMaterialCard.hover()
      await tributeMaterialCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, tributeSetupActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, tributeSetupActor.actor)
        return actorState.characterField.some((card) => card.instanceId === tributeSetupActor.cardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: 'T-900',
      })
      const ownerPage = summonActor.actorPage
      const summonCardInstanceId = summonActor.cardInstanceId

      await installAnimationCounter(ownerPage)
      const initialAnimationCount = await getAnimationCount(ownerPage)

      const summonCard = ownerPage.locator(`[data-testid="bottom-hand-card-${summonCardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      const tributeTarget = ownerPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${tributeSetupActor.cardInstanceId}"]`)
      await expect(tributeTarget).toBeVisible({ timeout: 5_000 })
      await tributeTarget.click()

      await ownerPage.getByRole('button', { name: /confirm tribute selection/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return {
          battlefieldHasSummonedCard: actorState.characterField.some((card) => card.instanceId === summonCardInstanceId),
          trashCount: actorState.trash.length,
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        battlefieldHasSummonedCard: true,
        trashCount: 1,
      })

      await expect.poll(async () => {
        return await getAnimationCount(ownerPage)
      }, {
        timeout: 6_000,
      }).toBeGreaterThan(initialAnimationCount)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('strict summon requirement only allows trait-matching tribute targets', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'summon-requirements-strict')
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const toadMaterialActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: 'T-110',
      })
      const toadMaterialCard = toadMaterialActor.actorPage.locator(`[data-testid="bottom-hand-card-${toadMaterialActor.cardInstanceId}"]`)
      await toadMaterialCard.hover()
      await toadMaterialCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, toadMaterialActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, toadMaterialActor.actor)
        return actorState.characterField.some((card) => card.instanceId === toadMaterialActor.cardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const nonToadMaterialActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: 'T-111',
      })
      const nonToadMaterialCard = nonToadMaterialActor.actorPage.locator(`[data-testid="bottom-hand-card-${nonToadMaterialActor.cardInstanceId}"]`)
      await nonToadMaterialCard.hover()
      await nonToadMaterialCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, nonToadMaterialActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, nonToadMaterialActor.actor)
        return actorState.characterField.some((card) => card.instanceId === nonToadMaterialActor.cardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const strictSummonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: 'T-910',
      })
      const ownerPage = strictSummonActor.actorPage
      const strictSummonCard = ownerPage.locator(`[data-testid="bottom-hand-card-${strictSummonActor.cardInstanceId}"]`)
      await strictSummonCard.hover()
      await strictSummonCard.getByRole('button', { name: /^summon$/i }).click()

      const strictTargets = await getCardActionTargetsViaHub(
        setup.gameCode,
        strictSummonActor.actor,
        strictSummonActor.actionId,
        strictSummonActor.cardInstanceId,
      )
      expect(strictTargets.map((target) => target.cardInstanceId)).toContain(toadMaterialActor.cardInstanceId)
      expect(strictTargets.map((target) => target.cardInstanceId)).not.toContain(nonToadMaterialActor.cardInstanceId)

      const validToadTarget = ownerPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${toadMaterialActor.cardInstanceId}"]`)
      const invalidLeafTarget = ownerPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${nonToadMaterialActor.cardInstanceId}"]`)

      await expect(validToadTarget).toBeVisible({ timeout: 5_000 })
      await expect(invalidLeafTarget).toBeVisible({ timeout: 5_000 })

      await validToadTarget.click()
      await ownerPage.getByRole('button', { name: /confirm tribute selection/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, strictSummonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, strictSummonActor.actor)
        return {
          summoned: actorState.characterField.some((card) => card.instanceId === strictSummonActor.cardInstanceId),
          trashedToad: actorState.trash.some((card) => card.instanceId === toadMaterialActor.cardInstanceId),
          leafStillInField: actorState.characterField.some((card) => card.instanceId === nonToadMaterialActor.cardInstanceId),
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        summoned: true,
        trashedToad: true,
        leafStillInField: true,
      })
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
