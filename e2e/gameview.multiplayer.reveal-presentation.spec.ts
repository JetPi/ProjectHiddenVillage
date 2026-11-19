import { expect, test } from '@playwright/test'
import { createFixtureDeck } from './helpers/multiplayer/fixtures'
import type { APIRequestContext, Page } from '@playwright/test'
import type {
  GamePlayerStateResponse,
  MultiplayerPages,
  MultiplayerSetup,
  PlayerAuth,
} from './helpers/gameviewMultiplayerHelpers'
import {
  closeMultiplayerPages,
  createDeadline,
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
  resolvePlayerState,
  resolvePromptViaHub,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

// Deck "two" (player two) is the blue [The Taka] deck and is the only seeded deck that carries the real
// "Reveal First" card, plus the leader whose own ability can stack the deck top:
//  - N-019 Jugo:    "[When Attacking] Reveal the top card of your deck, and if the revealed card is
//                    [Sasuke Uchiha] or a [The Taka] type card other than an EX Character, summon that card."
//  - N-012 Sasuke (leader): free "[Activate: Main] [Once Per Turn] Draw 1 card and place 1 card from your hand
//                    on top of your deck" - which is what makes the reveal's outcome deterministic instead of
//                    riding the shuffle.
// (N-013 Itachi's reveal is an [On Summon] one, so it is driven by the summon itself - see
//  ON_SUMMON_REVEAL_CARD_DEFINITION_ID below - instead of by an attack.)
const REVEAL_ON_ATTACK_CARD_DEFINITION_ID = 'N-019'
const DECK_TOP_ABILITY_EFFECT_KEY = 'draw-n-place-card'
// A card N-019's reveal refuses to summon: [Uchiha Clan]/[Akatsuki], i.e. neither [Sasuke Uchiha] nor [The Taka].
const REVEAL_NON_MATCH_DEFINITION_ID = 'N-013'
// The only [On Summon] effect a normal summon can reach (N-003/N-005/N-014 are EX Characters and the on-summon
// runner fires mandatory effects only). The same card doubles as the non-match above, so both scenarios pin
// opposite ends of it.
const ON_SUMMON_REVEAL_CARD_DEFINITION_ID = 'N-013'

// Cards N-019's reveal summons: a non-EX [Sasuke Uchiha] (N-015) or any [The Taka] card (Karin, Suigetsu or
// another Jugo). N-014 is [The Taka] too but an EX Character, so the reveal must never summon it.
const REVEAL_SUMMON_MATCH_DEFINITION_IDS = ['N-010', 'N-015', 'N-019', 'N-021']


const OWN_DECK_PILE_SELECTOR = '[data-side="bottom"] [data-testid="deck-pile-card"]'

let revealDeckId = ''
// N-013 is [Uchiha Clan] throughout, so its reveal post-condition is deterministic: the chosen leader is always
// frozen once the top card turns over.
let freezeDeckId = ''

test.describe('GameView multiplayer reveal presentation', () => {
  test.describe.configure({ timeout: 240_000 })

  test.beforeAll(async ({ request }) => {
    // Player two acts: their leader stacks the deck top, N-019 carries the reveal and N-013 is the card the
    // reveal either refuses (non-match) or turns over for the freeze prompt.
    revealDeckId = await createFixtureDeck(request, ['1x N-012', '10x N-019', '10x N-013'])
    freezeDeckId = await createFixtureDeck(request, ['1x N-012', '20x N-013'])
  })

  test('a [When Attacking] reveal presents the deck card, then flies the summoned card onto the field', async ({ browser, request }) => {
          const setup = await setupMultiplayerGame(request, 'default', { two: { deckId: revealDeckId } })
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playRevealSummonScenario(request, setup, pages)
      } finally {
        await closeMultiplayerPages(pages)
      }
  })

  test('a reveal that does not summon turns the deck card back face down', async ({ browser, request }) => {
          const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playRevealFlipBackScenario(request, setup, pages)
      } finally {
        await closeMultiplayerPages(pages)
      }
  })

  test('an [On Summon] reveal asks for the freeze target first, then presents the deck card', async ({ browser, request }) => {
      const setup = await setupMultiplayerGame(request, 'default', { two: { deckId: freezeDeckId } })
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playOnSummonRevealScenario(request, setup, pages)
      } finally {
        await closeMultiplayerPages(pages)
      }
  })
})

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
 * Summons N-013 Itachi - the only card in the seed whose [On Summon] reveal a normal summon can reach. Its chain
 * is authored "choose -> reveal -> conditionally freeze": the summon asks for the Leader/Character pick *before*
 * the deck is turned over, then presents the revealed card, and - because this fixture's deck is [Uchiha Clan]
 * throughout - resolves the authored freeze on the card chosen in the first step, without asking again.
 */
async function playOnSummonRevealScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const actor = setup.playerTwo
  const actorPage = pages.playerTwoPage


  const itachiSummon = await resolveActorMainPhaseWindow(request, setup, actor, (actorState) => {
    const itachi = findHandCardWithAction(actorState, ON_SUMMON_REVEAL_CARD_DEFINITION_ID, 'summon')
    // The freeze assertion below reads the actor's own leader Battle chip, and the first-turn rule outranks the
    // freeze: wait until the actor is past their first turn, where that chip is enabled - which is also the
    // "before" half of the freeze proof.
    const leaderBattleAction = (actorState.leader.availableActions ?? [])
      .find((action) => action.actionId.startsWith('battle-action:'))

    if (!itachi || leaderBattleAction?.isEnabled !== true) {
      return null
    }

    return { instanceId: itachi.instanceId, actionId: itachi.actionId }
  })

  // The presentation lasts only REVEAL_PRESENTATION_MS (2 s), so "was it presented" is read from the page-side
  // deck observer, which records the flip even when the client acknowledges the prompt before a poll sees it.
  await installDeckRevealObserver(actorPage)

  await executeCardActionViaHub(setup.gameCode, actor, itachiSummon.actionId, itachiSummon.instanceId)

  // 1. The choice comes first: the chain asks for the Leader/Character pick before it reveals anything, so the
  //    summon has already resolved (the effect is an [On Summon] one) while the deck is still face down.
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return state.pendingPrompt?.selectionPromptKind ?? 'none'
  }, { timeout: 20_000 }).toBe('FreezeFromZone')

  const choosePromptState = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
  const choosePrompt = choosePromptState.pendingPrompt
  const actorLeaderInstanceId = resolvePlayerState(choosePromptState, actor).leader.instanceId ?? ''

  expect(
    resolvePlayerState(choosePromptState, actor).characterField.some((card) => card.instanceId === itachiSummon.instanceId),
    'the summon must have resolved before the chain asks for its target',
  ).toBe(true)
  expect(
    (resolvePlayerState(choosePromptState, actor).deck ?? []).filter((card) => card.isRevealed === true).length,
    'the target must be chosen before the reveal turns the deck top over',
  ).toBe(0)

  // The rule order puts the Leader rule first, so the prompt's zone hint is Leader; both players' leaders are
  // offered, and the actor's own is the one picked below (its chip is the one the active player can read).
  expect(choosePrompt?.candidateZone).toBe('Leader')
  expect(choosePrompt?.options).toContain(actorLeaderInstanceId)
  expect(
    choosePrompt?.options ?? [],
    'the freeze must offer the opposing leader too ("choose 1 Leader or Character")',
  ).toContain(resolvePlayerState(choosePromptState, setup.playerOne).leader.instanceId)

  const actorLeaderCard = actorPage.locator('[data-zone="leader-card"][data-slot-side="bottom"]')
  await expect(actorLeaderCard).toBeVisible({ timeout: 10_000 })
  await actorLeaderCard.hover()

  const leaderSelectChip = actorLeaderCard.getByTestId('leader-effect-target-toggle')
  await expect(leaderSelectChip).toBeVisible({ timeout: 10_000 })
  await leaderSelectChip.click()

  // 2. Answering the pick lets the chain reveal: the deck top turns face up and is presented. The client
  //    acknowledges that prompt on its own, so the observer is what makes the check reliable.
  await expect.poll(async () => {
    const observations = await getDeckRevealObservations(actorPage)
    if (observations.some((entry) => entry.revealed)) {
      return true
    }

    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return (state.pendingPrompt?.selectionPromptKind ?? 'none') === 'RevealPresentation'
  }, {
    timeout: 20_000,
  }).toBe(true)

  // 3. The fixture deck is [Uchiha Clan] throughout, so the reveal's post-condition matches and the chain's
  //    chained freeze resolves on the card chosen in step 1 - no second prompt, straight to the restriction.
  //    `statusEffects` is phase-independent, unlike the leader's Battle chip, whose disabled reason reports the
  //    phase once the main phase is gone.
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return (resolvePlayerState(state, actor).leader.statusEffects ?? []).map((status) => status.kind)
  }, { timeout: 15_000 }).toContain('CannotAttack')

  // The same restriction reaches the board as a badge on the leader, and the unusable Battle chip is not
  // rendered there.
  const leaderCannotAttackBadge = actorLeaderCard.locator('[data-status-effect="CannotAttack"]')
  await expect(leaderCannotAttackBadge).toBeVisible({ timeout: 10_000 })
  await expect(actorLeaderCard.getByRole('button', { name: /^battle$/i })).toHaveCount(0)

  // The chain is done once the freeze resolves, so this is when the transient reveal goes back face down — the
  // card is still in the deck where the reveal found it (a plain reveal never moves it).
  await expect.poll(async () => {
    const observations = await getDeckRevealObservations(actorPage)
    const presentedIndex = observations.findIndex((entry) => entry.revealed)

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
    }
  }, {
    timeout: 15_000,
  }).toEqual({
    pendingPromptKind: 'none',
    revealedDeckCards: 0,
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
  // Wall-clock budget rather than a cycle count, for the same reason as the shared resolvers: a cycle is a
  // no-op while the engine is parked behind an unacknowledged phase presentation, so counting cycles made the
  // search depend on how fast the machine happened to be. ~75 s matches the old nominal worst case.
  const deadline = createDeadline(75_000)

  while (!deadline.expired) {
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

  throw new Error(
    `The requested MainPhase window did not arrive within the ${deadline.budgetMs} ms search budget `
    + `(spent ${deadline.elapsedMs} ms).`,
  )
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

