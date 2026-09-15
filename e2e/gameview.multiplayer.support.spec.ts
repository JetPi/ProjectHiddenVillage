import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import type { MultiplayerPages, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  declarePassInActionStepViaHub,
  executeBattleActionViaHub,
  fetchGameState,
  getBottomSupportCardsBySlot,
  getCardGhostAnimationCount,
  installCardGhostAnimationCounter,
  openMultiplayerPages,
  progressToNextDecisionWindow,
  resolveActorWithBottomBattleAction,
  resolveActorWithBottomHandAction,
  resolveAllMulliganPrompts,
  resolvePlayerState,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Deck "one" (player one) carries N-006, deck "two" (player two) carries N-017. Both are
// "[During Your Opponent's Attack] Choose up to 2 rested Characters: K.O. the chosen cards." - the only
// range effects in the catalogue, i.e. the only cards that reach the client multi-pick selection.
const RANGE_SUPPORT_DEFINITION_ID_BY_DECK = {
  playerOne: 'N-006',
  playerTwo: 'N-017',
} as const

// Plain normal-summonable characters per deck (no on-summon effects to prompt): N-007 has "Your Turn"
// rush toggles, N-015 only carries a During-Your-Main support.
const PLAIN_SUMMON_DEFINITION_ID_BY_DECK = {
  playerOne: 'N-007',
  playerTwo: 'N-015',
} as const

// N-020 (Sakura Haruno): "[During Your Opponent's Attack] Choose 1 Character: Return the chosen card to the
// owner's hand." Lives in deck two only.
const RETURN_TO_HAND_SUPPORT_CARD_DEFINITION_ID = 'N-020'

// Neither opening hand is guaranteed to hold a range support (three copies in a 31-card deck), and a game
// where nobody draws one ends in a deck-out before the scenario can play out. Each attempt plays a fresh
// game, so the spec stays reliable instead of riding a single shuffle.
const RANGE_SUPPORT_ATTEMPT_COUNT = 3

test.describe('GameView multiplayer support activation', () => {
  test.describe.configure({ timeout: 240_000 })

  // Seed profile `default` deck "one" (leader N-001) contains the real support cards:
  //  - N-007 (Minato) is a plain summonable Character, used to put a card on the field.
  //  - N-004 (Naruto Uzumaki, Rasengan) is "[During Your Main] K.O. all Characters." for 2 chakra and
  //    targets every character (auto-select-all), which makes the resolution easy to observe.
  const SUMMONABLE_CHARACTER_CARD_DEFINITION_ID = 'N-007'
  const SUPPORT_CARD_DEFINITION_ID = 'N-004'

  test('support activated from hand resolves after the opponent passes', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      // 1. Put a character on the field so "K.O. all Characters" has something to destroy.
      const summonActor = await resolveActorWithBottomHandAction(
        request,
        setup,
        pages,
        'Summon',
        { cardDefinitionId: SUMMONABLE_CHARACTER_CARD_DEFINITION_ID },
      )
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

      // 2. Activate the support straight from hand: your-turn supports may be played from hand.
      const supportActor = await resolveActorWithBottomHandAction(
        request,
        setup,
        pages,
        'Support',
        { cardDefinitionId: SUPPORT_CARD_DEFINITION_ID, actorUserId: summonActor.actor.userId },
      )
      const supportCard = supportActor.actorPage.locator(`[data-testid="bottom-hand-card-${supportActor.cardInstanceId}"]`)
      await supportCard.hover()
      await supportCard.getByRole('button', { name: /^support$/i }).click()

      const opponent = supportActor.actor.userId === setup.playerOne.userId ? setup.playerTwo : setup.playerOne

      // 3. The activation opens a reaction window: it is paid for and queued, but nothing has resolved
      //    yet and the opponent holds priority with a pass available.
      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, opponent.session.accessToken)
        const opponentState = resolvePlayerState(state, opponent)
        const actorState = resolvePlayerState(state, supportActor.actor)
        return {
          chakraSpent: actorState.resourcePool,
          supportStillInHand: actorState.hand.some((card) => card.instanceId === supportActor.cardInstanceId),
          opponentHoldsPriority: (state.priorityPlayerId ?? '') !== '',
          opponentCanPass: (state.availableActions ?? []).some((action) => action.actionId === 'pass-turn'),
          battlefieldStillPopulated: actorState.characterField.length,
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        chakraSpent: 3,
        supportStillInHand: false,
        opponentHoldsPriority: true,
        opponentCanPass: true,
        battlefieldStillPopulated: 1,
      })

      // 4. The phase row names the [Support Activated] window on both sides: the opponent is the one being
      //    asked for a response, the activator sees that the window is theirs to wait on.
      await expect(pages.playerOnePage.getByTestId('phase-indicator')).toContainText('Support Activated')
      await expect(pages.playerTwoPage.getByTestId('phase-indicator')).toContainText('Support Activated')

      const [opponentPage, activatorPage] = opponent.userId === setup.playerOne.userId
        ? [pages.playerOnePage, pages.playerTwoPage]
        : [pages.playerTwoPage, pages.playerOnePage]
      await expect(opponentPage.getByTestId('phase-indicator')).toContainText('Your Response')
      await expect(activatorPage.getByTestId('phase-indicator')).toContainText('Opponent Response')

      // 5. The opponent declines: that single pass closes the window (the activator is only asked after an
      //    actual reaction), so the activation resolves and K.O.s every character on the board.
      await installCardGhostAnimationCounter(activatorPage)
      await declarePassInActionStepViaHub(setup.gameCode, opponent)

      await expect.poll(async () => {
        const [actorState, opponentState] = await Promise.all([
          fetchGameState(request, setup.gameCode, supportActor.actor.session.accessToken),
          fetchGameState(request, setup.gameCode, opponent.session.accessToken),
        ])

        return {
          actorCharacters: resolvePlayerState(actorState, supportActor.actor).characterField.length,
          opponentCharacters: resolvePlayerState(opponentState, opponent).characterField.length,
          actorTrash: resolvePlayerState(actorState, supportActor.actor).trash.length,
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        actorCharacters: 0,
        opponentCharacters: 0,
        // The summoned character plus the support card that was activated from hand.
        actorTrash: 2,
      })

      // 6. The MainPhase resumed for the turn player, and the K.O.'d character flew into the trash as a
      //    card ghost instead of appearing there out of nowhere.
      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, supportActor.actor.session.accessToken)
        return state.phase
      }, {
        timeout: 12_000,
      }).toBe('MainPhase')
      await expect(activatorPage.getByTestId('phase-indicator')).not.toContainText('Support Activated')
      expect(await getCardGhostAnimationCount(activatorPage)).toBeGreaterThan(0)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('range support picks its targets with the multi-select board and K.O.s them', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < RANGE_SUPPORT_ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playRangeSupportScenario(request, setup, pages)
        return
      } catch (error) {
        lastFailure = error
      } finally {
        await closeMultiplayerPages(pages)
      }
    }

    throw lastFailure
  })

  test('a character bounced by N-020 animates back into its owner hand', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < RANGE_SUPPORT_ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playReturnToHandScenario(request, setup, pages)
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

/**
 * N-020 (Sakura Haruno) is the "[During Your Opponent's Attack] Choose 1 Character: Return the chosen card
 * to the owner's hand" support, and it only exists in deck two - so player two defends with it while player
 * one attacks, and the bounced character has to land back in player one's hand with a ghost flight.
 */
async function playReturnToHandScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const attacker = setup.playerOne
  const defender = setup.playerTwo

  const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
  await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

  await advanceToMulliganPromptIfNeeded(request, setup)
  await resolveAllMulliganPrompts(request, setup, 'noMulligan')

  // 1. The attacker summons a plain character so there is something to bounce.
  const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
    actorUserId: attacker.userId,
    cardDefinitionId: PLAIN_SUMMON_DEFINITION_ID_BY_DECK.playerOne,
  })
  const attackerPage = summonActor.actorPage
  const attackerCardInstanceId = summonActor.cardInstanceId
  const attackerHandCard = attackerPage.locator(`[data-testid="bottom-hand-card-${attackerCardInstanceId}"]`)
  await attackerHandCard.hover()
  await attackerHandCard.getByRole('button', { name: /^summon$/i }).click()

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, attacker.session.accessToken)
    return resolvePlayerState(state, attacker).characterField
      .some((card) => card.instanceId === attackerCardInstanceId)
  }, {
    timeout: 12_000,
  }).toBe(true)

  // 2. The defender sets N-020 face down (it is own-turn only from hand, so it has to be in the support area).
  const setSupportActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Set Support', {
    actorUserId: defender.userId,
    cardDefinitionId: RETURN_TO_HAND_SUPPORT_CARD_DEFINITION_ID,
  })
  const defenderPage = setSupportActor.actorPage
  const supportCardInstanceId = setSupportActor.cardInstanceId
  const supportHandCard = defenderPage.locator(`[data-testid="bottom-hand-card-${supportCardInstanceId}"]`)
  await supportHandCard.hover()
  await supportHandCard.getByRole('button', { name: /^set support$/i }).click()

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, defender.session.accessToken)
    return resolvePlayerState(state, defender).supportZone.some((card) => card.instanceId === supportCardInstanceId)
  }, {
    timeout: 12_000,
  }).toBe(true)

  // 3. The attacker attacks, opening the cut-in window the bounce support can answer.
  const attack = await resolveActorWithBottomBattleAction(request, setup, pages)
  expect(attack.cardInstanceId).toBe(attackerCardInstanceId)
  await executeBattleActionViaHub(setup.gameCode, attack.actor, attack.actionId, attack.cardInstanceId)

  // 4. N-020 asks for exactly one character: the single-pick "Choose" flow, not the range multi-pick.
  const supportZoneCard = defenderPage.locator(
    `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${supportCardInstanceId}"]`,
  )
  await expect(supportZoneCard).toBeVisible()
  await supportZoneCard.hover()
  await supportZoneCard.getByRole('button', { name: /^support$/i }).click()

  const restableCharacterCard = defenderPage.locator(
    `[data-zone="character-field-card"][data-slot-side="top"][data-card-instance-id="${attackerCardInstanceId}"]`,
  )
  await expect(restableCharacterCard).toBeVisible()
  await restableCharacterCard.hover()
  await restableCharacterCard.getByRole('button', { name: /^choose$/i }).click()

  // 5. The attacker declines to react, the activation resolves, and the character flies back to hand.
  await installCardGhostAnimationCounter(attackerPage)
  await passUntilCardReturnsToHand(request, setup, attacker, attackerCardInstanceId)

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, attacker.session.accessToken)
    const attackerState = resolvePlayerState(state, attacker)
    return {
      battlefieldCharacters: attackerState.characterField.length,
      returnedToHand: attackerState.hand.some((card) => card.instanceId === attackerCardInstanceId),
    }
  }, {
    timeout: 12_000,
  }).toEqual({
    battlefieldCharacters: 0,
    returnedToHand: true,
  })

  // The bounce is animated into the hand row instead of the card simply reappearing there.
  expect(await getCardGhostAnimationCount(attackerPage)).toBeGreaterThan(0)
}

async function playRangeSupportScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      // Neither opening hand is guaranteed to hold a range support, so the roles follow the hands:
      // whoever holds theirs defends, the other player attacks.
      const { attacker, defender, rangeCardDefinitionId } = await resolveRangeSupportRoles(request, setup)
      const attackerRole = attacker.userId === setup.playerOne.userId ? 'playerOne' : 'playerTwo'

      // 1. The attacker summons a plain character (no on-summon prompt) so it can attack on a later turn.
      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: attacker.userId,
        cardDefinitionId: PLAIN_SUMMON_DEFINITION_ID_BY_DECK[attackerRole],
      })
      const attackerCardInstanceId = summonActor.cardInstanceId
      const attackerHandCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${attackerCardInstanceId}"]`)
      await attackerHandCard.hover()
      await attackerHandCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, attacker.session.accessToken)
        return resolvePlayerState(state, attacker).characterField
          .some((card) => card.instanceId === attackerCardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      // 2. The defender sets the range support face down: a hand support is own-turn only, so acting
      //    during the opponent's attack requires it in the support area. No slot pick - the engine drops
      //    the card into the leftmost empty support slot.
      const setSupportActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Set Support', {
        actorUserId: defender.userId,
        cardDefinitionId: rangeCardDefinitionId,
      })
      const defenderPage = setSupportActor.actorPage
      const supportCardInstanceId = setSupportActor.cardInstanceId
      const occupiedSlots = new Set((await getBottomSupportCardsBySlot(defenderPage)).map((entry) => entry.slotIndex))
      const expectedSlotIndex = [0, 1, 2, 3, 4].find((slotIndex) => !occupiedSlots.has(slotIndex))

      expect(typeof expectedSlotIndex).toBe('number')
      if (typeof expectedSlotIndex !== 'number') {
        return
      }

      const supportHandCard = defenderPage.locator(`[data-testid="bottom-hand-card-${supportCardInstanceId}"]`)
      await supportHandCard.hover()
      await supportHandCard.getByRole('button', { name: /^set support$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, defender.session.accessToken)
        return resolvePlayerState(state, defender).supportZone.some((card) => card.instanceId === supportCardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      await expect.poll(async () => {
        return await getBottomSupportCardsBySlot(defenderPage)
      }, {
        timeout: 12_000,
      }).toEqual(expect.arrayContaining([
        {
          slotIndex: expectedSlotIndex,
          instanceId: supportCardInstanceId,
        },
      ]))
      // 3. The attacker declares a battle (the hub helper targets the defender's leader), which opens the
      //    support cut-in window. Attacking rests the attacker - the range support's only legal target here.
      const attack = await resolveActorWithBottomBattleAction(request, setup, pages)
      expect(attack.cardInstanceId).toBe(attackerCardInstanceId)
      await executeBattleActionViaHub(setup.gameCode, attack.actor, attack.actionId, attack.cardInstanceId)

      // 4. Activating the range support from the support area opens the multi-pick selection instead of
      //    resolving a single chosen target: the phase row reports the outstanding count.
      const supportZoneCard = defenderPage.locator(
        `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${supportCardInstanceId}"]`,
      )
      await expect(supportZoneCard).toBeVisible()
      await supportZoneCard.hover()
      await supportZoneCard.getByRole('button', { name: /^support$/i }).click()

      const phaseIndicator = defenderPage.getByTestId('phase-indicator')
      await expect(phaseIndicator).toContainText('Selecting support targets (needs: 1)', { timeout: 12_000 })

      const restedAttackerCard = defenderPage.locator(
        `[data-zone="character-field-card"][data-slot-side="top"][data-card-instance-id="${attackerCardInstanceId}"]`,
      )
      await expect(restedAttackerCard).toBeVisible()
      await restedAttackerCard.hover()
      const targetToggle = restedAttackerCard.getByTestId('effect-target-toggle')
      await expect(targetToggle).toHaveText('Select')
      await targetToggle.click()
      await expect(targetToggle).toHaveText('Selected')
      await expect(phaseIndicator).toContainText('Fulfilled target selection', { timeout: 12_000 })

      await defenderPage.getByTestId('confirm-effect-target-selection-button').click()

      // The activation is revealed while it waits for responses: the opponent must be able to see which
      // support is on the stack before it resolves.
      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, defender.session.accessToken)
        return resolvePlayerState(state, defender).supportZone
          .some((card) => card.instanceId === supportCardInstanceId && card.isFaceUp === true)
      }, {
        timeout: 12_000,
      }).toBe(true)

      // 5. Passes resolve the queued activation: the rested attacker is K.O.'d and the used support leaves
      //    the support area for the trash (it is spent, not parked face up). The K.O. flies the card into
      //    the trash as a ghost.
      await installCardGhostAnimationCounter(defenderPage)
      await passUntilAttackerIsDefeated(request, setup, attacker, attackerCardInstanceId)

      await expect.poll(async () => {
        const [attackerState, defenderState] = await Promise.all([
          fetchGameState(request, setup.gameCode, attacker.session.accessToken),
          fetchGameState(request, setup.gameCode, defender.session.accessToken),
        ])

        const defenderStateAfterResolution = resolvePlayerState(defenderState, defender)
        return {
          attackerCharacters: resolvePlayerState(attackerState, attacker).characterField.length,
          supportLeftSupportArea: !defenderStateAfterResolution.supportZone
            .some((card) => card.instanceId === supportCardInstanceId),
          usedSupportInTrash: defenderStateAfterResolution.trash
            .some((card) => card.instanceId === supportCardInstanceId),
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        attackerCharacters: 0,
        supportLeftSupportArea: true,
        usedSupportInTrash: true,
      })

      // The K.O.'d attacker was animated out of the field, not teleported into the trash.
      expect(await getCardGhostAnimationCount(defenderPage)).toBeGreaterThan(0)
}

/**
 * The bounce activation resolves once the asked player declines, after which the bounced card leaves the
 * battlefield for its owner's hand. Stops as soon as that happened (or the pass budget runs out).
 */
async function passUntilCardReturnsToHand(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  owner: MultiplayerSetup['playerOne'],
  cardInstanceId: string,
): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const ownerState = owner.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const ownerStateAfterResolution = resolvePlayerState(ownerState, owner)
    const returnedToHand = ownerStateAfterResolution.hand.some((card) => card.instanceId === cardInstanceId)
      && !ownerStateAfterResolution.characterField.some((card) => card.instanceId === cardInstanceId)

    if (returnedToHand) {
      return
    }

    const playerOneCanPass = playerOneState.availableActions
      .some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    const playerTwoCanPass = playerTwoState.availableActions
      .some((action) => action.actionId === 'pass-turn' && action.isEnabled)

    if (playerOneCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerOne)
    } else if (playerTwoCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerTwo)
    }

    await wait(400)
  }
}

/**
 * The attacker is whoever does *not* hold their deck's range support at the moment one of them does: only
 * the defender can play it ("[During Your Opponent's Attack]"). Neither opening hand is guaranteed to
 * hold it, so turns are advanced - both players draw two cards from turn 2 on - until one player does.
 */
async function resolveRangeSupportRoles(
  request: APIRequestContext,
  setup: Awaited<ReturnType<typeof setupMultiplayerGame>>,
): Promise<{
  attacker: typeof setup.playerOne
  defender: typeof setup.playerOne
  rangeCardDefinitionId: string
}> {
  const rangeCardByPlayerId = new Map([
    [setup.playerOne.userId, RANGE_SUPPORT_DEFINITION_ID_BY_DECK.playerOne],
    [setup.playerTwo.userId, RANGE_SUPPORT_DEFINITION_ID_BY_DECK.playerTwo],
  ])

  for (let cycle = 0; cycle < 12; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const candidates = [
      { player: setup.playerOne, state: playerOneState },
      { player: setup.playerTwo, state: playerTwoState },
    ]

    for (const candidate of candidates) {
      const rangeCardDefinitionId = rangeCardByPlayerId.get(candidate.player.userId)
      if (!rangeCardDefinitionId) {
        continue
      }

      const hand = resolvePlayerState(candidate.state, candidate.player).hand
      const holdsRangeSupport = hand.some((card) =>
        (card.cardDefinitionId ?? '').trim().toUpperCase() === rangeCardDefinitionId)

      if (holdsRangeSupport) {
        return {
          attacker: candidate.player.userId === setup.playerOne.userId ? setup.playerTwo : setup.playerOne,
          defender: candidate.player,
          rangeCardDefinitionId,
        }
      }
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error('Neither player drew their "choose up to 2" support within the search window.')
}

/**
 * The activation is queued on the resolution stack, so it resolves once both players pass through the
 * cut-in window. Stops as soon as the K.O. lands (the attack itself may keep running to the damage step).
 */
async function passUntilAttackerIsDefeated(
  request: APIRequestContext,
  setup: Awaited<ReturnType<typeof setupMultiplayerGame>>,
  attacker: typeof setup.playerOne,
  attackerCardInstanceId: string,
): Promise<void> {
  for (let step = 0; step < 10; step += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const attackerState = attacker.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const attackerIsDefeated = !resolvePlayerState(attackerState, attacker).characterField
      .some((card) => card.instanceId === attackerCardInstanceId)

    if (attackerIsDefeated) {
      return
    }

    const playerOneCanPass = playerOneState.availableActions
      .some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    const playerTwoCanPass = playerTwoState.availableActions
      .some((action) => action.actionId === 'pass-turn' && action.isEnabled)

    if (playerOneCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerOne)
    } else if (playerTwoCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerTwo)
    }

    await wait(400)
  }
}
