import { expect, test } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  fetchGameState,
  getCardActionTargetsViaHub,
  getAnimationCount,
  getBottomBattlefieldInstanceOrder,
  getBottomSupportCardsBySlot,
  getPileSlotGeometrySamples,
  installAnimationCounter,
  installPileSlotGeometryObserver,
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

      // The tribute material flies field->trash while the played card leaves the hand: the trash slot must keep
      // its lane size throughout (a spurious "the freed hand card landed in the trash" flight animated that slot
      // in place and flashed a ~2.5x-tall card while its ancestors were un-clipped).
      const bottomTrashSlot = ownerPage.locator('[data-side="bottom"] [data-testid="trash-pile-card"]')
      const stableTrashSlotBox = await bottomTrashSlot.boundingBox()
      expect(stableTrashSlotBox).not.toBeNull()
      await installPileSlotGeometryObserver(ownerPage, 'bottom')

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

      // The trash slot's hover "eye" opens the pile reader: it lists every card of that pile (here the one
      // tribute that just left the field). The count line is count-only by design (the newest-first ordering
      // hint was deliberately dropped, so assert the count alone - never the old "· most recent first" suffix).
      await bottomTrashPile.hover()
      await bottomTrashPile.getByTestId('trash-pile-viewer-button').click()

      const trashOverlay = ownerPage.getByTestId('card-list-overlay')
      await expect(trashOverlay).toBeVisible({ timeout: 5_000 })
      await expect(trashOverlay).toContainText('Your trash pile')
      await expect(trashOverlay).toContainText('1 card')
      await expect(trashOverlay).not.toContainText('most recent first')

      const trashPileEntries = trashOverlay.getByTestId(/^card-list-item-/)
      await expect(trashPileEntries).toHaveCount(1)
      await expect(trashPileEntries.first()).toHaveAttribute('data-card-definition-id', POWER_MATERIAL_CARD_DEFINITION_ID)

      // Closing it is client-only (the viewer submits nothing to the hub) and Escape works like it does on
      // the card-details modal.
      await ownerPage.keyboard.press('Escape')
      await expect(trashOverlay).toBeHidden()

      // Every frame of the tribute flight is in by now: the trash slot never grew past its lane size.
      const trashSlotSamples = await getPileSlotGeometrySamples(ownerPage)
      expect(trashSlotSamples.length).toBeGreaterThan(0)
      const oversizedSamples = trashSlotSamples.filter((sample) => {
        return sample.width > stableTrashSlotBox!.width * 1.1 || sample.height > stableTrashSlotBox!.height * 1.1
      })
      expect(oversizedSamples).toEqual([])
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  // T-121 is the recall fixture: a normally summonable [Naruto Uzumaki] with 10+ power, so it is both a legal
  // Gamabunta tribute material and a valid "[On Summon] Summon 1 ... [Naruto Uzumaki] from your trash" target.
  const RECALL_MATERIAL_CARD_DEFINITION_ID = 'T-121'

  // N-005's "[On Summon] Summon 1 non-EX [Naruto Uzumaki], [Jiraiya], or [Minato Namikaze] Character from your
  // trash" is the authored prompted zone selection: its candidate pool only exists once the chain reaches the
  // step. Normal-summon the fixture, hand it over as the tribute material, and the chain must ask instead of
  // silently summoning nothing.
  test('Gamabunta on-summon effect asks for the trash card and summons the answer', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'on-summon-trash-recall')
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const materialActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: RECALL_MATERIAL_CARD_DEFINITION_ID,
      })
      const ownerPage = materialActor.actorPage
      const materialInstanceId = materialActor.cardInstanceId

      const materialCard = ownerPage.locator(`[data-testid="bottom-hand-card-${materialInstanceId}"]`)
      await materialCard.hover()
      await materialCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, materialActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, materialActor.actor)
        return actorState.characterField.some((card) => card.instanceId === materialInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: GAMABUNTA_CARD_DEFINITION_ID,
      })
      const gamabuntaInstanceId = summonActor.cardInstanceId

      const summonCard = ownerPage.locator(`[data-testid="bottom-hand-card-${gamabuntaInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      const tributeTarget = ownerPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${materialInstanceId}"]`)
      await expect(tributeTarget).toBeVisible({ timeout: 5_000 })
      await tributeTarget.hover()
      await tributeTarget.getByRole('button', { name: /^tribute$/i }).click()

      await expect(ownerPage.getByTestId('phase-indicator')).toContainText('Fulfilled tribute requirements', { timeout: 5_000 })
      await ownerPage.getByRole('button', { name: /confirm tribute selection/i }).click()

      // The tribute is in the trash now, so the [On Summon] chain has exactly one candidate: it must open the
      // picker (a trash candidate, so the card-list overlay, not a board Select button).
      const promptOverlay = ownerPage.getByTestId('prompt-overlay')
      await expect(promptOverlay).toBeVisible({ timeout: 12_000 })
      await expect(promptOverlay).toContainText('Choose a Character to Summon')
      await expect(ownerPage.getByTestId('phase-indicator')).toContainText('Select a Character to summon')

      const candidateOptions = promptOverlay.getByTestId(/^prompt-card-option-/)
      await expect(candidateOptions).toHaveCount(1)
      await candidateOptions.first().click()

      await expect(promptOverlay).toBeHidden({ timeout: 12_000 })

      // The recalled card left the trash and landed next to Gamabunta, which stayed on the field.
      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return {
          fieldHasRecalled: actorState.characterField.some((card) => card.instanceId === materialInstanceId),
          fieldHasGamabunta: actorState.characterField.some((card) => card.instanceId === gamabuntaInstanceId),
          trashCount: actorState.trash.length,
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        fieldHasRecalled: true,
        fieldHasGamabunta: true,
        trashCount: 0,
      })

      // A pick happened, so the "no valid targets" notice must never appear.
      await expect(ownerPage.getByTestId('effect-notice-banner')).toBeHidden()
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  // The other half of the same card: with a trash the recall filter cannot match (only the T-120 tribute
  // material), there is nothing to pick. The engine must not strand the chain on an empty prompt - it records a
  // notice the board shows as a transient toast while every other action stays usable.
  test('Gamabunta on-summon effect without a matching trash card shows a notice and keeps the board playable', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'summon-requirements')
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const materialActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: POWER_MATERIAL_CARD_DEFINITION_ID,
      })
      const ownerPage = materialActor.actorPage
      const materialInstanceId = materialActor.cardInstanceId

      const materialCard = ownerPage.locator(`[data-testid="bottom-hand-card-${materialInstanceId}"]`)
      await materialCard.hover()
      await materialCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, materialActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, materialActor.actor)
        return actorState.characterField.some((card) => card.instanceId === materialInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: setup.playerOne.userId,
        cardDefinitionId: GAMABUNTA_CARD_DEFINITION_ID,
      })
      const gamabuntaInstanceId = summonActor.cardInstanceId

      const summonCard = ownerPage.locator(`[data-testid="bottom-hand-card-${gamabuntaInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      const tributeTarget = ownerPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${materialInstanceId}"]`)
      await expect(tributeTarget).toBeVisible({ timeout: 5_000 })
      await tributeTarget.hover()
      await tributeTarget.getByRole('button', { name: /^tribute$/i }).click()

      await expect(ownerPage.getByTestId('phase-indicator')).toContainText('Fulfilled tribute requirements', { timeout: 5_000 })
      await ownerPage.getByRole('button', { name: /confirm tribute selection/i }).click()

      // T-120 is not one of the recall names, so the triggered summon has no candidate: the board says so
      // instead of looking like nothing happened.
      const notice = ownerPage.getByTestId('effect-notice-banner')
      await expect(notice).toBeVisible({ timeout: 12_000 })
      await expect(ownerPage.getByTestId('effect-notice-message')).toHaveText("Gamabunta's effect had no valid targets.")

      // No picker (there is nothing to pick), no error banner, and the toast cannot swallow clicks.
      await expect(ownerPage.getByTestId('prompt-overlay')).toBeHidden()
      await expect(ownerPage.getByTestId('game-action-error-banner')).toBeHidden()
      await expect(notice).toHaveCSS('pointer-events', 'none')
      await expect(ownerPage.getByTestId('phase-indicator')).toContainText('Your turn', { timeout: 10_000 })

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return {
          fieldHasGamabunta: actorState.characterField.some((card) => card.instanceId === gamabuntaInstanceId),
          trashHasMaterial: actorState.trash.some((card) => card.instanceId === materialInstanceId),
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        fieldHasGamabunta: true,
        trashHasMaterial: true,
      })
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

      // N-014's [On Summon] "destroy 1 Character" is authored `Prompted` + `Per Step`, so the chain asks once it
      // reaches the node instead of resolving no targets up front. Its only candidate here is the card that was
      // just summoned (the two materials already left the field), and a field prompt is answered by the card's
      // own Select button rather than the card-list overlay.
      await expect(ownerPage.getByTestId('phase-indicator')).toContainText('Select a Character to destroy', { timeout: 8_000 })

      const summonedCardOnField = ownerPage.locator(
        `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${summonCardInstanceId}"]`,
      )
      await expect(summonedCardOnField).toBeVisible({ timeout: 5_000 })
      await summonedCardOnField.hover()
      await summonedCardOnField.getByTestId('effect-target-toggle').click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return {
          summonCardLeftField: !actorState.characterField.some((card) => card.instanceId === summonCardInstanceId),
          trashHasSummonCard: actorState.trash.some((card) => card.instanceId === summonCardInstanceId),
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        summonCardLeftField: true,
        trashHasSummonCard: true,
      })
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
