import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import type {
  GamePlayerStateResponse,
  MultiplayerPages,
  MultiplayerSetup,
  PlayerAuth,
} from './helpers/gameviewMultiplayerHelpers'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  executeBattleActionViaHub,
  executeCardActionViaHub,
  fetchGameState,
  getBattlefieldEntryAnimations,
  getDeckRevealObservations,
  installBattlefieldEntryAnimationRecorder,
  installDeckRevealObserver,
  normalizeUserId,
  openMultiplayerPages,
  progressToNextDecisionWindow,
  resolveActorWithLeaderEffectAction,
  resolveAllMulliganPrompts,
  resolvePlayerState,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

// Deck "two" (player two) is the blue [The Taka] deck and is the only seeded deck that carries the real
// "Reveal First" card, plus the leader whose own ability can stack the deck top:
//  - N-019 Jugo:    "[When Attacking] Reveal the top card of your deck, and if the revealed card is
//                    [Sasuke Uchiha] or a [The Taka] type card other than an EX Character, summon that card."
//  - N-012 Sasuke (leader): free "[Activate: Main] [Once Per Turn] Draw 1 card and place 1 card from your hand
//                    on top of your deck" - which is what makes the reveal's outcome deterministic instead of
//                    riding the shuffle.
// (N-013 Itachi's reveal is an [On Summon] one, and `EffectTiming.OnSummon` still has no engine runner - it only
// exists as an enum/condition keyword - so the presentation can only be played through N-019 today.)
const REVEAL_ON_ATTACK_CARD_DEFINITION_ID = 'N-019'
const DECK_TOP_ABILITY_EFFECT_KEY = 'draw-n-place-card'
// A card N-019's reveal refuses to summon: [Uchiha Clan]/[Akatsuki], i.e. neither [Sasuke Uchiha] nor [The Taka].
const REVEAL_NON_MATCH_DEFINITION_ID = 'N-013'

// Cards N-019's reveal summons: a non-EX [Sasuke Uchiha] (N-015) or any [The Taka] card (Karin, Suigetsu or
// another Jugo). N-014 is [The Taka] too but an EX Character, so the reveal must never summon it.
const REVEAL_SUMMON_MATCH_DEFINITION_IDS = ['N-010', 'N-015', 'N-019', 'N-021']

// Both scenarios need a specific card in an opening/drawn hand (three copies in a 33-card deck), so - like the
// range-support spec - each attempt plays a fresh game instead of riding a single shuffle.
const ATTEMPT_COUNT = 3

const OWN_DECK_PILE_SELECTOR = '[data-side="bottom"] [data-testid="deck-pile-card"]'

test.describe('GameView multiplayer reveal presentation', () => {
  test.describe.configure({ timeout: 240_000 })

  test('a [When Attacking] reveal presents the deck card, then flies the summoned card onto the field', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playRevealSummonScenario(request, setup, pages)
        return
      } catch (error) {
        lastFailure = error
      } finally {
        await closeMultiplayerPages(pages)
      }
    }

    throw lastFailure
  })

  test('a reveal that does not summon turns the deck card back face down', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playRevealFlipBackScenario(request, setup, pages)
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

/** Plays the shared opening: someone decides who starts, then both players keep their opening hand. */
async function playOpening(request: APIRequestContext, setup: MultiplayerSetup): Promise<void> {
  const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
  await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

  await advanceToMulliganPromptIfNeeded(request, setup)
  await resolveAllMulliganPrompts(request, setup, 'noMulligan')
}


/**
 * Summons N-019 Jugo, waits for the turn it may attack, stacks the deck top with a card its reveal will summon
 * (using the leader's own free ability), and then attacks: the reveal turns that card over, the chain waits for
 * the presentation, the client acknowledges it on its own, and the summoned card flies out of the deck slot
 * onto Jugo's character field.
 */
async function playRevealSummonScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const actor = setup.playerTwo
  const actorPage = pages.playerTwoPage

  await playOpening(request, setup)

  // 1. Put Jugo on the field. Its reveal only fires when it attacks, and a character cannot attack the turn it
  //    is summoned, so the flow below waits for the following turn to attack with it.
  const jugoSummon = await resolveActorMainPhaseWindow(request, setup, actor, (actorState) => {
    const jugo = findHandCardWithAction(actorState, REVEAL_ON_ATTACK_CARD_DEFINITION_ID, 'summon')
    return jugo ? { instanceId: jugo.instanceId, actionId: jugo.actionId } : null
  })

  await executeCardActionViaHub(setup.gameCode, actor, jugoSummon.actionId, jugoSummon.instanceId)

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return resolvePlayerState(state, actor).characterField.some((card) => card.instanceId === jugoSummon.instanceId)
  }, {
    timeout: 15_000,
  }).toBe(true)

  // 2. Wait for a turn where Jugo may attack AND a card its reveal would summon is still in hand. Everything
  //    below happens inside that one MainPhase, so the stacked top card is still on the deck when the attack
  //    resolves (a turn change would draw it away).
  const attackWindow = await resolveActorMainPhaseWindow(request, setup, actor, (actorState) => {
    const jugo = actorState.characterField.find((card) => card.instanceId === jugoSummon.instanceId)
    const battleAction = (jugo?.availableActions ?? []).find((action) => {
      return action.isEnabled && action.label.trim().toLowerCase() === 'battle'
    })
    const matchCard = actorState.hand.find((card) => {
      return card.instanceId !== jugoSummon.instanceId
        && REVEAL_SUMMON_MATCH_DEFINITION_IDS.includes(card.cardDefinitionId ?? '')
    })

    if (!battleAction || !matchCard) {
      return null
    }

    return {
      battleActionId: battleAction.actionId,
      matchCardInstanceId: matchCard.instanceId,
      matchCardDefinitionId: matchCard.cardDefinitionId ?? '',
    }
  })

  // 3. Stack the deck top with that card: the leader draws 1 card and then asks which hand card goes on top.
  const deckTopAction = await resolveActorWithLeaderEffectAction(request, setup, pages, {
    actorUserId: actor.userId,
    effectKey: DECK_TOP_ABILITY_EFFECT_KEY,
  })
  await executeCardActionViaHub(setup.gameCode, actor, deckTopAction.actionId, deckTopAction.leaderInstanceId)

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return state.pendingPrompt?.selectionPromptKind ?? 'none'
  }, {
    timeout: 15_000,
  }).toBe('PlaceOnDeckTop')

  await resolvePromptViaHub(setup.gameCode, actor, attackWindow.matchCardInstanceId)

  const stackState = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
  expect(
    resolvePlayerState(stackState, actor).deck?.[0]?.instanceId,
    'the placed card must be the top card of the deck',
  ).toBe(attackWindow.matchCardInstanceId)


  // 4. Attack with Jugo: the [When Attacking] reveal turns the stacked card over and the chain waits for its
  //    presentation. That presentation only lasts REVEAL_PRESENTATION_MS (2 s), so the pause is caught by a poll
  //    that starts BEFORE the attack is submitted and the flip by the page-side deck observer.
  await installDeckRevealObserver(actorPage)
  await installBattlefieldEntryAnimationRecorder(actorPage)

  const presentationSeen = expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return state.pendingPrompt?.selectionPromptKind ?? 'none'
  }, {
    timeout: 20_000,
  }).toBe('RevealPresentation')

  await executeBattleActionViaHub(setup.gameCode, actor, attackWindow.battleActionId, jugoSummon.instanceId)
  await presentationSeen

  // The presentation IS the pause: the revealed card is still in the deck, its summon has not run, and the only
  // thing the server waits for is the acknowledgement (which no player has to click).
  const pausedState = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
  const pausedActorState = resolvePlayerState(pausedState, actor)
  const revealedDeckCard = (pausedActorState.deck ?? []).find((card) => card.isRevealed === true)

  expect(pausedState.pendingPrompt?.isAwaitingRequestingPlayer).toBe(true)
  expect(revealedDeckCard?.cardDefinitionId).toBe(attackWindow.matchCardDefinitionId)
  expect(
    pausedActorState.characterField.some((card) => card.instanceId === revealedDeckCard?.instanceId),
  ).toBe(false)


  // 5. The acknowledgement resumes the chain: the revealed card lands on Jugo's field, flown out of the deck
  //    slot, and the deck slot turns back over because the card left the deck.
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return resolvePlayerState(state, actor).characterField.some((card) => card.instanceId === revealedDeckCard?.instanceId)
  }, {
    timeout: 20_000,
  }).toBe(true)

  await expect(deckPileOf(actorPage)).not.toHaveAttribute('data-revealed', 'true', { timeout: 10_000 })

  // The deck slot really turned face up with the stacked card - and the summoned card only flew in afterwards.
  const revealObservations = await getDeckRevealObservations(actorPage)
  const presentedReveal = revealObservations.find((entry) => entry.revealed)
  expect(presentedReveal?.definitionId, 'the presentation must show the revealed deck card').toBe(
    attackWindow.matchCardDefinitionId,
  )

  const entryAnimations = await getBattlefieldEntryAnimations(actorPage)
  const flightEntry = entryAnimations.find((entry) => entry.instanceId === revealedDeckCard?.instanceId)
  // `runRectToDynamicElementAnimation` starts the card offset from its own slot: a zero translate would mean it
  // appeared in place instead of flying in from the deck.
  expect(flightEntry?.fromTransform, 'the summon must fly the card out of the deck slot').toMatch(
    /translate\(-?\d+(\.\d+)?px, -?\d+(\.\d+)?px\)/,
  )
  expect(flightEntry!.at).toBeGreaterThan(presentedReveal!.at)
}

/**
 * The same attack as the summon scenario, but the deck top is stacked with a card N-019's reveal does NOT summon
 * (N-013 Itachi is neither [Sasuke Uchiha] nor a [The Taka] card). The reveal is still presented - and once the
 * chain settles the card has to be back face down and still in the deck, which is the server's end-of-chain
 * un-reveal (nothing else would ever turn it back over).
 */
async function playRevealFlipBackScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const actor = setup.playerTwo
  const actorPage = pages.playerTwoPage

  await playOpening(request, setup)

  const jugoSummon = await resolveActorMainPhaseWindow(request, setup, actor, (actorState) => {
    const jugo = findHandCardWithAction(actorState, REVEAL_ON_ATTACK_CARD_DEFINITION_ID, 'summon')
    return jugo ? { instanceId: jugo.instanceId, actionId: jugo.actionId } : null
  })

  await executeCardActionViaHub(setup.gameCode, actor, jugoSummon.actionId, jugoSummon.instanceId)

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return resolvePlayerState(state, actor).characterField.some((card) => card.instanceId === jugoSummon.instanceId)
  }, {
    timeout: 15_000,
  }).toBe(true)

  const attackWindow = await resolveActorMainPhaseWindow(request, setup, actor, (actorState) => {
    const jugo = actorState.characterField.find((card) => card.instanceId === jugoSummon.instanceId)
    const battleAction = (jugo?.availableActions ?? []).find((action) => {
      return action.isEnabled && action.label.trim().toLowerCase() === 'battle'
    })
    const nonMatchCard = actorState.hand.find((card) => card.cardDefinitionId === REVEAL_NON_MATCH_DEFINITION_ID)

    if (!battleAction || !nonMatchCard) {
      return null
    }

    return {
      battleActionId: battleAction.actionId,
      nonMatchCardInstanceId: nonMatchCard.instanceId,
      nonMatchCardDefinitionId: nonMatchCard.cardDefinitionId ?? '',
    }
  })

  const deckTopAction = await resolveActorWithLeaderEffectAction(request, setup, pages, {
    actorUserId: actor.userId,
    effectKey: DECK_TOP_ABILITY_EFFECT_KEY,
  })
  await executeCardActionViaHub(setup.gameCode, actor, deckTopAction.actionId, deckTopAction.leaderInstanceId)

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return state.pendingPrompt?.selectionPromptKind ?? 'none'
  }, {
    timeout: 15_000,
  }).toBe('PlaceOnDeckTop')

  await resolvePromptViaHub(setup.gameCode, actor, attackWindow.nonMatchCardInstanceId)

  // Attack with Jugo. The presentation lasts only REVEAL_PRESENTATION_MS (2 s), so the pause is caught by a poll
  // that starts BEFORE the attack is submitted and the flip by the page-side deck observer.
  await installDeckRevealObserver(actorPage)

  const presentationSeen = expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return state.pendingPrompt?.selectionPromptKind ?? 'none'
  }, {
    timeout: 20_000,
  }).toBe('RevealPresentation')

  await executeBattleActionViaHub(setup.gameCode, actor, attackWindow.battleActionId, jugoSummon.instanceId)
  await presentationSeen

  // Suspended on the presentation: the card is face up in the deck and nothing has resolved yet.
  const pausedState = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
  expect(pausedState.pendingPrompt?.isAwaitingRequestingPlayer).toBe(true)

  // The client acknowledges on its own, the chain ends without a summon (the post-condition does not match) and
  // the card it showed is turned back face down - in the deck, where the reveal found it.
  await expect.poll(async () => {
    const observations = await getDeckRevealObservations(actorPage)
    const presentedIndex = observations.findIndex((entry) => {
      return entry.revealed && entry.definitionId === attackWindow.nonMatchCardDefinitionId
    })

    return presentedIndex >= 0 && observations.slice(presentedIndex + 1).some((entry) => !entry.revealed)
  }, {
    timeout: 20_000,
  }).toBe(true)

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    const actorState = resolvePlayerState(state, actor)

    return {
      pendingPromptKind: state.pendingPrompt?.selectionPromptKind ?? 'none',
      revealedDeckCards: (actorState.deck ?? []).filter((card) => card.isRevealed === true).length,
      cardIsBackInTheDeck: (actorState.deck ?? []).some((card) => card.instanceId === attackWindow.nonMatchCardInstanceId),
      cardIsOnTheField: actorState.characterField.some((card) => card.instanceId === attackWindow.nonMatchCardInstanceId),
    }
  }, {
    timeout: 15_000,
  }).toEqual({
    pendingPromptKind: 'none',
    revealedDeckCards: 0,
    cardIsBackInTheDeck: true,
    cardIsOnTheField: false,
  })
}

/**
 * Advances turns until the requested actor is in their own MainPhase with no prompt pending and the caller's
 * window predicate finds what it needs there (a summonable card in hand, an unlocked attack, ...).
 */
async function resolveActorMainPhaseWindow<T>(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  actor: PlayerAuth,
  resolveWindow: (actorState: GamePlayerStateResponse) => T | null,
): Promise<T> {
  const maxCycles = 180

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const actorGameState = actor.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const canAct = actorGameState.phase === 'MainPhase'
      && actorGameState.pendingPrompt === null
      && normalizeUserId(actorGameState.activePlayerId) === actor.normalizedUserId

    if (canAct) {
      const resolvedWindow = resolveWindow(resolvePlayerState(actorGameState, actor))
      if (resolvedWindow) {
        return resolvedWindow
      }
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error('The requested MainPhase window did not arrive within the retry limit.')
}

/** The hand card with that definition id that currently offers the given enabled action label. */
function findHandCardWithAction(
  actorState: GamePlayerStateResponse,
  cardDefinitionId: string,
  actionLabel: 'summon',
): { instanceId: string; actionId: string } | null {
  const handCard = actorState.hand.find((card) => card.cardDefinitionId === cardDefinitionId)
  const action = (handCard?.availableActions ?? []).find((candidate) => {
    return candidate.isEnabled && candidate.label.trim().toLowerCase() === actionLabel
  })

  return handCard && action ? { instanceId: handCard.instanceId, actionId: action.actionId } : null
}

/** The acting player's own deck slot (their side is always rendered at the bottom of their own board). */
function deckPileOf(page: Page) {
  return page.locator(OWN_DECK_PILE_SELECTOR)
}

