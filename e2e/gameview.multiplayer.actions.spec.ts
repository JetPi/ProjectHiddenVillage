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

  // `test-data/seed-profiles.json` seeds the real N-005 (Gamabunta) card: a 10-power EX character that
  // can only be summoned by placing one of your characters with 10 or more power into the trash.
  const GAMABUNTA_CARD_DEFINITION_ID = 'N-005'
  // Dev fixture material for the summon-requirement suites: T-120 satisfies `Power >= 10`, N-021 does not.
  const POWER_MATERIAL_CARD_DEFINITION_ID = 'T-120'
  const LOW_POWER_MATERIAL_CARD_DEFINITION_ID = 'N-021'
  // Short label the server derives for N-005's `Power >= 10` tribute material rule.
  const POWER_MATERIAL_REQUIREMENT_LABEL = 'Power ≥ 10'

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

  test('set support drops the card into the leftmost empty slot with animation', async ({ browser, request }) => {
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
      // No slot pick: the card has to land in the leftmost empty slot on its own.
      const expectedSlotIndex = [0, 1, 2, 3, 4].find((slotIndex) => !occupiedSlots.has(slotIndex))

      expect(typeof expectedSlotIndex).toBe('number')
      if (typeof expectedSlotIndex !== 'number') {
        return
      }

      const supportCard = ownerPage.locator(`[data-testid="bottom-hand-card-${supportCardInstanceId}"]`)
      await supportCard.hover()
      await supportCard.getByRole('button', { name: /^set support$/i }).click()

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
          slotIndex: expectedSlotIndex,
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

  test('Gamabunta summon requirement requires tribute selection before summoning', async ({ browser, request }) => {
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
        cardDefinitionId: POWER_MATERIAL_CARD_DEFINITION_ID,
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
        cardDefinitionId: GAMABUNTA_CARD_DEFINITION_ID,
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
      await expect(tributeTarget.getByTestId('tribute-requirement-label')).toHaveText(POWER_MATERIAL_REQUIREMENT_LABEL, { timeout: 5_000 })
      await expect(ownerPage.getByTestId('phase-indicator')).toContainText(`Selecting tribute materials (needs: (${POWER_MATERIAL_REQUIREMENT_LABEL} x1))`, { timeout: 5_000 })
      await tributeTarget.hover()
      await tributeTarget.getByRole('button', { name: /^tribute$/i }).click()

      await expect(ownerPage.getByTestId('phase-indicator')).toContainText('Fulfilled tribute requirements', { timeout: 5_000 })
      await ownerPage.getByRole('button', { name: /confirm tribute selection/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return {
          battlefieldHasSummonedCard: actorState.characterField.some((card) => card.instanceId === summonCardInstanceId),
          trashCount: actorState.trash.length,
          trashHasTributeInstance: actorState.trash.some((card) => card.instanceId === tributeSetupActor.cardInstanceId),
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        battlefieldHasSummonedCard: true,
        trashCount: 1,
        trashHasTributeInstance: true,
      })

      // The seeded T-* catalog images are placeholder URLs (`https://example.com/...`), so
      // `/api/card-art` legitimately 404s and `CardImage` swaps to its fallback - asserting on the
      // resolved art URL is racy. Identify the trash pile's displayed card deterministically instead.
      const bottomTrashPile = ownerPage.locator('[data-side="bottom"] [data-testid="trash-pile-card"]')
      await expect(bottomTrashPile).toHaveAttribute('data-card-definition-id', POWER_MATERIAL_CARD_DEFINITION_ID, { timeout: 6_000 })

      await expect.poll(async () => {
        return await getAnimationCount(ownerPage)
      }, {
        timeout: 6_000,
      }).toBeGreaterThan(initialAnimationCount)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('Gamabunta summon requirement only allows tribute targets with 10 or more power', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'summon-requirements-strict')
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const powerMaterialActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: POWER_MATERIAL_CARD_DEFINITION_ID,
      })
      const powerMaterialCard = powerMaterialActor.actorPage.locator(`[data-testid="bottom-hand-card-${powerMaterialActor.cardInstanceId}"]`)
      await powerMaterialCard.hover()
      await powerMaterialCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, powerMaterialActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, powerMaterialActor.actor)
        return actorState.characterField.some((card) => card.instanceId === powerMaterialActor.cardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const lowPowerMaterialActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: LOW_POWER_MATERIAL_CARD_DEFINITION_ID,
      })
      const lowPowerMaterialCard = lowPowerMaterialActor.actorPage.locator(`[data-testid="bottom-hand-card-${lowPowerMaterialActor.cardInstanceId}"]`)
      await lowPowerMaterialCard.hover()
      await lowPowerMaterialCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, lowPowerMaterialActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, lowPowerMaterialActor.actor)
        return actorState.characterField.some((card) => card.instanceId === lowPowerMaterialActor.cardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const strictSummonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: GAMABUNTA_CARD_DEFINITION_ID,
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
      expect(strictTargets.map((target) => target.cardInstanceId)).toContain(powerMaterialActor.cardInstanceId)
      expect(strictTargets.map((target) => target.cardInstanceId)).not.toContain(lowPowerMaterialActor.cardInstanceId)

      const validPowerTarget = ownerPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${powerMaterialActor.cardInstanceId}"]`)
      const invalidPowerTarget = ownerPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${lowPowerMaterialActor.cardInstanceId}"]`)

      await expect(validPowerTarget).toBeVisible({ timeout: 5_000 })
      await expect(invalidPowerTarget).toBeVisible({ timeout: 5_000 })

      await expect(validPowerTarget.getByTestId('tribute-requirement-label')).toHaveText(POWER_MATERIAL_REQUIREMENT_LABEL, { timeout: 5_000 })
      await expect(validPowerTarget.getByTestId('tribute-requirement-label')).toHaveClass(/bg-amber-300/)
      await expect(invalidPowerTarget.getByTestId('tribute-requirement-label')).toHaveCount(0)
      await expect(ownerPage.getByTestId('phase-indicator')).toContainText(`Selecting tribute materials (needs: (${POWER_MATERIAL_REQUIREMENT_LABEL} x1))`, { timeout: 5_000 })

      await invalidPowerTarget.hover()
      await expect(invalidPowerTarget.getByRole('button', { name: /^tribute$/i })).toHaveCount(0)
      await validPowerTarget.hover()
      await validPowerTarget.getByRole('button', { name: /^tribute$/i }).click()
      await expect(validPowerTarget.getByTestId('tribute-requirement-label')).toHaveClass(/bg-black/)
      await expect(ownerPage.getByTestId('phase-indicator')).toContainText('Fulfilled tribute requirements', { timeout: 5_000 })
      await ownerPage.getByRole('button', { name: /confirm tribute selection/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, strictSummonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, strictSummonActor.actor)
        return {
          summoned: actorState.characterField.some((card) => card.instanceId === strictSummonActor.cardInstanceId),
          trashedPowerMaterial: actorState.trash.some((card) => card.instanceId === powerMaterialActor.cardInstanceId),
          lowPowerStillInField: actorState.characterField.some((card) => card.instanceId === lowPowerMaterialActor.cardInstanceId),
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        summoned: true,
        trashedPowerMaterial: true,
        lowPowerStillInField: true,
      })
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('N-014 mixed summon requirement needs a generic material and a The Taka material', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'summon-requirements-multi')
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      // The two materials have to reach the field first: N-011 satisfies the unrestricted material
      // rule and N-019 (Jugo) carries the `The Taka` trait the second material rule demands.
      const summonMaterial = async (cardDefinitionId: string): Promise<string> => {
        const actor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
          actorUserId: setup.playerOne.userId,
          cardDefinitionId,
        })
        const card = actor.actorPage.locator(`[data-testid="bottom-hand-card-${actor.cardInstanceId}"]`)
        await card.hover()
        await card.getByRole('button', { name: /^summon$/i }).click()

        await expect.poll(async () => {
          const state = await fetchGameState(request, setup.gameCode, actor.actor.session.accessToken)
          const actorState = resolvePlayerState(state, actor.actor)
          return actorState.characterField.some((fieldCard) => fieldCard.instanceId === actor.cardInstanceId)
        }, {
          timeout: 12_000,
        }).toBe(true)

        return actor.cardInstanceId
      }

      const genericMaterialInstanceId = await summonMaterial('N-011')
      const takaMaterialInstanceId = await summonMaterial('N-019')

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: 'N-014',
      })
      const ownerPage = summonActor.actorPage
      const summonCardInstanceId = summonActor.cardInstanceId

      const summonCard = ownerPage.locator(`[data-testid="bottom-hand-card-${summonCardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      const genericMaterialOnField = ownerPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${genericMaterialInstanceId}"]`)
      const takaMaterialOnField = ownerPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${takaMaterialInstanceId}"]`)

      await expect(genericMaterialOnField).toBeVisible({ timeout: 5_000 })
      await expect(takaMaterialOnField).toBeVisible({ timeout: 5_000 })

      // The server declares both material groups, so each candidate advertises the rule it fulfils and
      // the phase indicator lists every outstanding material.
      await expect(genericMaterialOnField.getByTestId('tribute-requirement-label')).toHaveText('any', { timeout: 5_000 })
      await expect(takaMaterialOnField.getByTestId('tribute-requirement-label')).toHaveText('The Taka', { timeout: 5_000 })
      await expect(ownerPage.getByTestId('phase-indicator')).toContainText('Selecting tribute materials (needs: (any x1, The Taka x1))', { timeout: 5_000 })

      // Paying the generic material leaves only the trait requirement outstanding.
      await genericMaterialOnField.hover()
      await genericMaterialOnField.getByRole('button', { name: /^tribute$/i }).click()
      await expect(ownerPage.getByTestId('phase-indicator')).toContainText('Selecting tribute materials (needs: (The Taka x1))', { timeout: 5_000 })

      await takaMaterialOnField.hover()
      await takaMaterialOnField.getByRole('button', { name: /^tribute$/i }).click()
      await expect(ownerPage.getByTestId('phase-indicator')).toContainText('Fulfilled tribute requirements', { timeout: 5_000 })

      await ownerPage.getByRole('button', { name: /confirm tribute selection/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return {
          summonCardLeftHand: !actorState.hand.some((card) => card.instanceId === summonCardInstanceId),
          trashHasBothMaterials: [genericMaterialInstanceId, takaMaterialInstanceId].every((instanceId) =>
            actorState.trash.some((card) => card.instanceId === instanceId)),
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        summonCardLeftHand: true,
        trashHasBothMaterials: true,
      })
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
