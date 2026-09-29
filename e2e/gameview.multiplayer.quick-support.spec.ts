import { expect, test } from '@playwright/test'
import type { APIRequestContext, Locator, Page } from '@playwright/test'
import type {
  GameStateResponse,
  MultiplayerPages,
  MultiplayerSetup,
  PlayerAuth,
} from './helpers/gameviewMultiplayerHelpers'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  declarePassInActionStepViaHub,
  fetchGameState,
  normalizeUserId,
  openMultiplayerPages,
  progressToNextDecisionWindow,
  resolveActorWithBottomHandAction,
  resolveAllMulliganPrompts,
  resolvePlayerState,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// N-002 (Choji Akimichi, Expansion Jutsu) lives in deck "one" (player one):
//   "[Support] Expansion Jutsu - [Quick] Choose 1 Character: Summon this card, and the chosen card's power
//    is doubled during this turn."
// "[Quick] can be played at any valid Support Cut-in response window", and a MainPhase support activation
// opens one - so the *responder* answers from the support area, which is where this card was refused with
// "Support timing is not available right now." Its "summon this card" node is also authored as a
// summon-candidate rule pointing at the hand, so the activation has to be evaluated in the shape the engine
// executes (SupportActivationNormalizer) instead of the raw rule - otherwise the same chip reads
// "No valid targets available.".
const ANSWERER_QUICK_SUPPORT_CARD_DEFINITION_ID = 'N-002'
// Deck "two" (player two) opens the window: N-021 (Suigetsu, Water Transformation Jutsu) is a "[Quick]"
// support that can be activated from the support area on its own turn, which is what queues it and hands
// priority over. Its entry asks for one character to make immune, and it resolves without touching the
// answerer's board - so the summoned Choji is still on the field when the chain finishes.
const OPENER_SUPPORT_CARD_DEFINITION_ID = 'N-021'
// The answerer needs a character of their own on the field: N-002's doubling step ("Choose 1 Character")
// only offers the acting player's character field, so an empty board leaves nothing to pick. N-002 itself
// is excluded because the role search keeps that copy for the support slot.
const ANSWERER_PLAIN_SUMMON_CARD_DEFINITION_IDS = ['N-004', 'N-006', 'N-007', 'N-008', 'N-011', 'N-018'] as const

// The mirrored scenario: deck "two" (player two) holds the [Quick] support (N-021, Suigetsu) and answers a
// queued activation that deck "one" (player one) opened. The responder's own character is what N-021
// protects, so the opener's "[During Your Main] K.O. all Characters" (N-004) must still resolve - their
// character dies - while the immune one survives. N-004 is excluded from the summon candidates because the
// role search keeps that copy for the opening activation, exactly like N-002 above.
const RESPONDER_QUICK_SUPPORT_CARD_DEFINITION_ID = 'N-021'
const OPENER_KO_SUPPORT_CARD_DEFINITION_ID = 'N-004'
const OPENER_PLAIN_SUMMON_CARD_DEFINITION_IDS = ['N-002', 'N-006', 'N-007', 'N-008', 'N-011', 'N-018'] as const
const RESPONDER_PLAIN_SUMMON_CARD_DEFINITION_IDS = [
  'N-010',
  'N-013',
  'N-015',
  'N-016',
  'N-017',
  'N-019',
  'N-020',
] as const

// Neither player is guaranteed to hold their half (three copies in a 30+ card deck), and a game whose draw
// never cooperates decks out before the scenario can play. Every attempt plays a fresh game.
const SCENARIO_ATTEMPT_COUNT = 3
const ROLE_SEARCH_CYCLE_COUNT = 30

test.describe('GameView multiplayer quick support cut-in', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a [Quick] support answers a queued MainPhase activation from the support area', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < SCENARIO_ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playQuickSupportCutInScenario(request, setup, pages)
        return
      } catch (error) {
        lastFailure = error
      } finally {
        await closeMultiplayerPages(pages)
      }
    }

    throw lastFailure
  })

  test('a [Quick] support answered from the support area shields its target from the queued effect', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < SCENARIO_ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playQuickSupportResponseScenario(request, setup, pages)
        return
      } catch (error) {
        lastFailure = error
      } finally {
        await closeMultiplayerPages(pages)
      }
    }

    throw lastFailure
  })
})

async function playQuickSupportCutInScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
  await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

  await advanceToMulliganPromptIfNeeded(request, setup)
  await resolveAllMulliganPrompts(request, setup, 'noMulligan')

  const answerer = setup.playerOne
  const opener = setup.playerTwo
  const answererPage = pages.playerOnePage
  const openerPage = pages.playerTwoPage

  const summonCardDefinitionId = await resolveQuickSupportRoles(request, setup)

  // 1. The answerer's half: a character to double, and N-002 face down in the support area (an
  //    opponent-turn support must be played from the support area).
  await waitForMainPhase(request, setup, answerer)
  const answererCharacterInstanceId = await summonFromHand(
    request,
    setup,
    pages,
    answerer,
    summonCardDefinitionId,
  )
  const quickSupportInstanceId = await setSupportFromHand(
    request,
    setup,
    pages,
    answerer,
    ANSWERER_QUICK_SUPPORT_CARD_DEFINITION_ID,
  )

  // 2. The opener's half: set N-021 during their own MainPhase and activate it from the support area. That
  //    queues the activation and hands priority to the answerer - the support cut-in window.
  await waitForMainPhase(request, setup, opener)
  const openerSupportInstanceId = await setSupportFromHand(
    request,
    setup,
    pages,
    opener,
    OPENER_SUPPORT_CARD_DEFINITION_ID,
  )
  await activateSupportFromSupportZone(request, setup, openerPage, opener, openerSupportInstanceId)
  // Water Transformation Jutsu asks for exactly one character; the answerer's character is the only one out.
  await chooseTarget(openerPage.locator(
    `[data-zone="character-field-card"][data-slot-side="top"][data-card-instance-id="${answererCharacterInstanceId}"]`,
  ))

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, answerer.session.accessToken)
    return state.isSupportResponseWindowOpen === true
  }, {
    timeout: 15_000,
  }).toBe(true)

  // 3. The regression this spec exists for: N-002 answers the queued activation from the support area. Its
  //    chip used to be disabled ("Support timing is not available right now." / "No valid targets
  //    available.") exactly while the window was waiting for this player.
  const quickSupportCard = answererPage.locator(
    `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${quickSupportInstanceId}"]`,
  )
  await expect(quickSupportCard).toBeVisible()
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, answerer.session.accessToken)
    const supportCard = resolvePlayerState(state, answerer).supportZone
      .find((card) => card.instanceId === quickSupportInstanceId)
    return (supportCard?.availableActions ?? [])
      .find((action) => action.actionId.startsWith('activate-support:'))?.isEnabled === true
  }, {
    timeout: 15_000,
  }).toBe(true)

  await quickSupportCard.hover()
  await quickSupportCard.getByRole('button', { name: /^support$/i }).click()

  // 4. The doubling step is the activation's only selection, so the answerer picks their own character.
  await chooseTarget(answererPage.locator(
    `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${answererCharacterInstanceId}"]`,
  ))

  // A card whose own activation is queued publishes no support action at all - the chip is gone, not
  // disabled - which is the proof the answerer's activation actually reached the chain.
  await expectSupportChipRemoved(answererPage, quickSupportInstanceId)

  // 5. The opener declines: one decline closes the window and the chain resolves LIFO, so N-002 summons
  //    Choji onto the answerer's field and the used support leaves the support area for the trash.
  await passUntilQuickSupportResolves(request, setup, opener, answerer, quickSupportInstanceId)

  const finalState = await fetchGameState(request, setup.gameCode, answerer.session.accessToken)
  const finalAnswerer = resolvePlayerState(finalState, answerer)
  expect(finalAnswerer.characterField.some((card) => card.instanceId === quickSupportInstanceId)).toBe(true)
  expect(finalAnswerer.supportZone.some((card) => card.instanceId === quickSupportInstanceId)).toBe(false)
}

/** Completes a single-pick support selection: the chosen target's hover overlay offers exactly one "Choose". */
async function chooseTarget(targetCard: Locator): Promise<void> {
  await expect(targetCard).toBeVisible()
  await targetCard.hover()
  await targetCard.getByRole('button', { name: /^choose$/i }).click()
}

/**
 * Walks decision windows until both hands hold their half of the play: player one the Quick support plus a
 * plain character to summon, player two the "[During Your Main]" support that opens the window. Both players
 * draw two cards per turn from turn two on, so the window covers enough turns to dig for a specific three-of.
 */
async function resolveQuickSupportRoles(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<string> {
  for (let cycle = 0; cycle < ROLE_SEARCH_CYCLE_COUNT; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const holdsCard = (state: GameStateResponse, player: PlayerAuth, cardDefinitionId: string) =>
      resolvePlayerState(state, player).hand.some((card) =>
        (card.cardDefinitionId ?? '').trim().toUpperCase() === cardDefinitionId)

    const answererSummonCardDefinitionId = ANSWERER_PLAIN_SUMMON_CARD_DEFINITION_IDS
      .find((cardDefinitionId) => holdsCard(playerOneState, setup.playerOne, cardDefinitionId))

    if (holdsCard(playerOneState, setup.playerOne, ANSWERER_QUICK_SUPPORT_CARD_DEFINITION_ID)
      && holdsCard(playerTwoState, setup.playerTwo, OPENER_SUPPORT_CARD_DEFINITION_ID)
      && answererSummonCardDefinitionId) {
      return answererSummonCardDefinitionId
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error('The Quick-support cut-in play did not come together within the search window.')
}

/** Advances decision windows until it is the actor's MainPhase (where their setup actions are legal). */
async function waitForMainPhase(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  actor: PlayerAuth,
): Promise<void> {
  for (let cycle = 0; cycle < 60; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const actorState = actor.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    if (actorState.phase === 'MainPhase'
      && normalizeUserId(actorState.activePlayerId) === actor.normalizedUserId) {
      return
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error("The actor never reached their MainPhase within the search window.")
}

/** Summons a hand character through its hover chip and returns the card instance id. */
async function summonFromHand(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actor: PlayerAuth,
  cardDefinitionId: string,
): Promise<string> {
  const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
    actorUserId: actor.userId,
    cardDefinitionId,
  })

  const handCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
  await handCard.hover()
  await handCard.getByRole('button', { name: /^summon$/i }).click()

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return resolvePlayerState(state, actor).characterField
      .some((card) => card.instanceId === summonActor.cardInstanceId)
  }, {
    timeout: 15_000,
  }).toBe(true)

  return summonActor.cardInstanceId
}

/** Sets a hand card face down in the support area and returns its card instance id. */
async function setSupportFromHand(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actor: PlayerAuth,
  cardDefinitionId: string,
): Promise<string> {
  const setSupportActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Set Support', {
    actorUserId: actor.userId,
    cardDefinitionId,
  })

  const handCard = setSupportActor.actorPage.locator(`[data-testid="bottom-hand-card-${setSupportActor.cardInstanceId}"]`)
  await handCard.hover()
  await handCard.getByRole('button', { name: /^set support$/i }).click()

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return resolvePlayerState(state, actor).supportZone
      .some((card) => card.instanceId === setSupportActor.cardInstanceId)
  }, {
    timeout: 15_000,
  }).toBe(true)

  return setSupportActor.cardInstanceId
}

/** Waits for the support-zone activation to become available on the actor's turn, then clicks its chip. */
async function activateSupportFromSupportZone(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  actorPage: Page,
  actor: PlayerAuth,
  supportInstanceId: string,
): Promise<void> {
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    const supportCard = resolvePlayerState(state, actor).supportZone
      .find((card) => card.instanceId === supportInstanceId)
    return (supportCard?.availableActions ?? [])
      .some((action) => action.isEnabled && action.actionId.startsWith('activate-support:'))
  }, {
    timeout: 90_000,
    intervals: [500, 1_000, 2_000],
  }).toBe(true)

  const supportZoneCard = actorPage.locator(
    `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${supportInstanceId}"]`,
  )
  await expect(supportZoneCard).toBeVisible()
  await supportZoneCard.hover()
  await supportZoneCard.getByRole('button', { name: /^support$/i }).click()
}

/**
 * A support already in the chain publishes no support action at all, so its hover overlay has no Support
 * button - it shows the disabled "No actions" placeholder instead. The preview chip is asserted first: it
 * proves the hover landed and the overlay is rendering, so the missing Support button is the rule and not a
 * hover that never happened.
 */
async function expectSupportChipRemoved(page: Page, supportInstanceId: string): Promise<void> {
  const supportZoneCard = page.locator(
    `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${supportInstanceId}"]`,
  )
  await expect(supportZoneCard).toBeVisible()
  await supportZoneCard.hover()

  await expect(supportZoneCard.getByRole('button', { name: 'Open card details' })).toBeVisible()
  await expect(supportZoneCard.getByTestId('card-no-actions-chip')).toHaveText('No actions')
  await expect(supportZoneCard.getByRole('button', { name: /^support$/i })).toHaveCount(0)
}

/**
 * The opener declines the queued chain - one decline closes the support window - until the answerer's used
 * support has left its slot and the summoned card is on the field.
 */
async function passUntilQuickSupportResolves(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  passer: PlayerAuth,
  owner: PlayerAuth,
  supportInstanceId: string,
): Promise<void> {
  for (let step = 0; step < 20; step += 1) {
    const ownerState = await fetchGameState(request, setup.gameCode, owner.session.accessToken)
    const resolvedOwnerState = resolvePlayerState(ownerState, owner)
    const leftSupportZone = !resolvedOwnerState.supportZone
      .some((card) => card.instanceId === supportInstanceId)
    const isOnField = resolvedOwnerState.characterField
      .some((card) => card.instanceId === supportInstanceId)

    if (leftSupportZone && isOnField && ownerState.isSupportResponseWindowOpen !== true) {
      return
    }

    if (ownerState.isSupportResponseWindowOpen === true) {
      const passerState = await fetchGameState(request, setup.gameCode, passer.session.accessToken)
      const ownerCanPass = ownerState.availableActions
        .some((action) => action.actionId === 'pass-turn' && action.isEnabled)
      const passerCanPass = passerState.availableActions
        .some((action) => action.actionId === 'pass-turn' && action.isEnabled)

      if (passerCanPass) {
        await declarePassInActionStepViaHub(setup.gameCode, passer)
      } else if (ownerCanPass) {
        await declarePassInActionStepViaHub(setup.gameCode, owner)
      }
    }

    await wait(400)
  }

  throw new Error('The Quick-support chain did not resolve within the search window.')
}

/**
 * The mirrored cut-in: player one opens a MainPhase activation that would K.O. every character, player two
 * answers it with N-021 from *their* support area, and the immunity N-021 grants is what keeps their
 * character alive when the opener's effect finally resolves.
 *
 * The engine pieces this pins: the support cut-in window accepting a `[Quick]` support from the support
 * area for the player who is *not* the turn player (`SupportTimingRules.IsOpponentTurnQuickWindow`), the
 * availability of that activation being evaluated on the normalised entry node (otherwise the chip reads
 * "No valid targets available."), and `FilterSupportEffectImmuneTargets` dropping the shielded card out of
 * a support effect that auto-selects every character.
 */
async function playQuickSupportResponseScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
  await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

  await advanceToMulliganPromptIfNeeded(request, setup)
  await resolveAllMulliganPrompts(request, setup, 'noMulligan')

  const opener = setup.playerOne
  const responder = setup.playerTwo
  const responderPage = pages.playerTwoPage

  // 1. The responder's half: a character for N-021 to shield, and N-021 face down in the support area (a
  //    support played on the opponent's turn must come from the support area).
  await waitForMainPhase(request, setup, responder)
  const responderCharacterInstanceId = await summonFirstAvailableCharacter(
    request,
    setup,
    pages,
    responder,
    RESPONDER_PLAIN_SUMMON_CARD_DEFINITION_IDS,
  )
  const quickSupportInstanceId = await setSupportFromHand(
    request,
    setup,
    pages,
    responder,
    RESPONDER_QUICK_SUPPORT_CARD_DEFINITION_ID,
  )

  // 2. The opener's half: a character of their own (the K.O. has to visibly resolve) and the K.O. support
  //    activated from the hand during their own MainPhase, which queues it and hands priority over.
  await waitForMainPhase(request, setup, opener)
  const openerCharacterInstanceId = await summonFirstAvailableCharacter(
    request,
    setup,
    pages,
    opener,
    OPENER_PLAIN_SUMMON_CARD_DEFINITION_IDS,
  )
  const koSupportInstanceId = await activateHandSupport(
    request,
    setup,
    pages,
    opener,
    OPENER_KO_SUPPORT_CARD_DEFINITION_ID,
  )

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, responder.session.accessToken)
    return state.isSupportResponseWindowOpen === true
  }, {
    timeout: 15_000,
  }).toBe(true)

  // 3. The regression this scenario exists for: the responder's N-021 must publish an *enabled* support
  //    chip while the window waits for them, even though it is the opener's turn and the card sits in the
  //    support area. It used to read "Support timing is not available right now." / "No valid targets
  //    available." for exactly this window.
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, responder.session.accessToken)
    const supportCard = resolvePlayerState(state, responder).supportZone
      .find((card) => card.instanceId === quickSupportInstanceId)
    return (supportCard?.availableActions ?? [])
      .find((action) => action.actionId.startsWith('activate-support:'))?.isEnabled === true
  }, {
    timeout: 15_000,
  }).toBe(true)

  const quickSupportCard = responderPage.locator(
    `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${quickSupportInstanceId}"]`,
  )
  await expect(quickSupportCard).toBeVisible()
  await quickSupportCard.hover()
  await quickSupportCard.getByRole('button', { name: /^support$/i }).click()

  // Water Transformation Jutsu asks for exactly one character; the responder shields their own.
  await chooseTarget(responderPage.locator(
    `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${responderCharacterInstanceId}"]`,
  ))

  // A card whose own activation is queued publishes no support action at all - the chip is gone, not
  // disabled - which is the proof the responder's activation reached the chain.
  await expectSupportChipRemoved(responderPage, quickSupportInstanceId)

  // 4. The opener declines: one decline closes the window and the chain resolves LIFO, so the immunity
  //    lands before the K.O. The shielded character survives while the opener's own one does not.
  await passUntilChainCloses(request, setup, opener)

  const finalOpenerState = await fetchGameState(request, setup.gameCode, opener.session.accessToken)
  const finalOpener = resolvePlayerState(finalOpenerState, opener)
  expect(finalOpener.characterField.some((card) => card.instanceId === openerCharacterInstanceId)).toBe(false)
  expect(finalOpener.trash.some((card) => card.instanceId === openerCharacterInstanceId)).toBe(true)
  // A hand activation is consumed as it is queued, so the opener no longer holds the K.O. support.
  expect(finalOpener.hand.some((card) => card.instanceId === koSupportInstanceId)).toBe(false)

  const finalResponderState = await fetchGameState(request, setup.gameCode, responder.session.accessToken)
  const finalResponder = resolvePlayerState(finalResponderState, responder)
  expect(finalResponder.characterField.some((card) => card.instanceId === responderCharacterInstanceId)).toBe(true)
  expect(finalResponder.supportZone.some((card) => card.instanceId === quickSupportInstanceId)).toBe(false)
  expect(finalResponderState.isSupportResponseWindowOpen).not.toBe(true)
}
/**
 * Summons the first hand card from the whitelist that offers an enabled "Summon" chip, advancing decision
 * windows while it looks (a fresh game's opening hand may hold none of the candidates).
 */
async function summonFirstAvailableCharacter(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actor: PlayerAuth,
  candidateDefinitionIds: readonly string[],
): Promise<string> {
  for (let cycle = 0; cycle < ROLE_SEARCH_CYCLE_COUNT; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const actorState = actor.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const isActorMainPhase = actorState.phase === 'MainPhase'
      && actorState.pendingPrompt === null
      && normalizeUserId(actorState.activePlayerId) === actor.normalizedUserId

    if (isActorMainPhase) {
      const candidate = resolvePlayerState(actorState, actor).hand.find((card) =>
        candidateDefinitionIds.includes((card.cardDefinitionId ?? '').trim().toUpperCase())
        && (card.availableActions ?? [])
          .some((action) => action.isEnabled && action.label.trim().toLowerCase() === 'summon'))

      if (candidate) {
        const actorPage = actor.userId === setup.playerOne.userId ? pages.playerOnePage : pages.playerTwoPage
        const handCard = actorPage.locator(`[data-testid="bottom-hand-card-${candidate.instanceId}"]`)
        await handCard.hover()
        await handCard.getByRole('button', { name: /^summon$/i }).click()

        await expect.poll(async () => {
          const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
          return resolvePlayerState(state, actor).characterField
            .some((card) => card.instanceId === candidate.instanceId)
        }, { timeout: 15_000 }).toBe(true)

        return candidate.instanceId
      }
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error('None of the whitelisted characters could be summoned within the search window.')
}

/** Activates a support from the hand through its hover chip (label "Support"). */
async function activateHandSupport(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actor: PlayerAuth,
  cardDefinitionId: string,
): Promise<string> {
  const supportActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Support', {
    actorUserId: actor.userId,
    cardDefinitionId,
  })

  const handCard = supportActor.actorPage.locator(`[data-testid="bottom-hand-card-${supportActor.cardInstanceId}"]`)
  await handCard.hover()
  await handCard.getByRole('button', { name: /^support$/i }).click()

  return supportActor.cardInstanceId
}

/**
 * Declines the open support window until it closes. Unlike `passUntilQuickSupportResolves` this cannot wait
 * for the summoned support card to stay on the field: the mirror scenario's N-021 lands right into the
 * opener's K.O., so only the window closing is a reliable signal.
 */
async function passUntilChainCloses(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  passer: PlayerAuth,
): Promise<void> {
  for (let step = 0; step < 20; step += 1) {
    const state = await fetchGameState(request, setup.gameCode, passer.session.accessToken)

    if (state.isSupportResponseWindowOpen !== true) {
      return
    }

    const canPass = state.availableActions
      .some((action) => action.actionId === 'pass-turn' && action.isEnabled)

    if (canPass) {
      await declarePassInActionStepViaHub(setup.gameCode, passer)
    }

    await wait(400)
  }

  throw new Error('The support window did not close within the search window.')
}




