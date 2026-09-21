import { expect, test } from '@playwright/test'
import type { APIRequestContext, Locator, Page } from '@playwright/test'
import type { MultiplayerPages, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  declarePassInActionStepViaHub,
  fetchGameState,
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

// Deck "one" (player one) answers with N-009 ([Support Activated] Negate that card), deck "two" (player two)
// owns the "[During Your Main] K.O. all Characters" supports N-004/N-015. The negate publishes the queued
// activation as its target, so the card the player picks sits in the *opponent's* support row - the exact
// place that lost its slot when the highlight landed on it.
// N-016 (deck two) is the mirror negate but its chain asks for two target selections, which the server still
// rejects (SupportActivationTargetPlanner.MultipleSelectionsDisabledReason), so the scenario uses N-009.
const NEGATOR_NEGATE_CARD_DEFINITION_ID = 'N-009'
const ACTIVATOR_KO_SUPPORT_CARD_DEFINITION_ID = 'N-015'
// Deck-two characters without on-summon effects (so the summon needs no prompt handling): N-019 keeps its
// reveal effect for attacks only, N-020 its bounce support for the opponent's attack. Either satisfies the
// "put a character on the field" step, which keeps the role search from depending on one specific card.
const ACTIVATOR_PLAIN_SUMMON_CARD_DEFINITION_IDS = ['N-019', 'N-020'] as const

// Neither player is guaranteed to hold their half of the play (three copies in a 31-card deck), and a game
// where the draw never cooperates ends in a deck-out before the scenario can play out. Each attempt plays a
// fresh game, so the spec stays reliable instead of riding a single shuffle.
const SCENARIO_ATTEMPT_COUNT = 3

// Decision windows the role search walks before giving up on an attempt. Both players draw two cards per
// turn from turn two on, so the window has to cover enough turns to dig for a specific three-of.
const ROLE_SEARCH_CYCLE_COUNT = 30

type SlotGeometry = {
  slotIndex: number
  x: number
  y: number
  width: number
  height: number
}

test.describe('GameView support targeting keeps support slots in place', () => {
  test.describe.configure({ timeout: 240_000 })

  test('negate targeting a support-zone card does not move or resize the support row', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < SCENARIO_ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playSupportNegateTargetingScenario(request, setup, pages)
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

async function playSupportNegateTargetingScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
  await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

  await advanceToMulliganPromptIfNeeded(request, setup)
  await resolveAllMulliganPrompts(request, setup, 'noMulligan')

  const { negator, activator, plainSummonCardDefinitionId } = await resolveNegateRoles(request, setup)
  const negatorPage = negator.userId === setup.playerOne.userId ? pages.playerOnePage : pages.playerTwoPage
  const activatorPage = activator.userId === setup.playerOne.userId ? pages.playerOnePage : pages.playerTwoPage

  // 1. The negator sets N-009 face down: "[Support Activated]" is opponent-turn only, so the card has to be
  //    waiting in the support area before the window opens. No slot pick - the engine uses the leftmost
  //    empty slot.
  await setSupportFromHand(request, setup, pages, negator, NEGATOR_NEGATE_CARD_DEFINITION_ID)

  // 2. The activator summons a plain character: it is the card whose survival proves the K.O. support was
  //    negated instead of resolving.
  const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
    actorUserId: activator.userId,
    cardDefinitionId: plainSummonCardDefinitionId,
  })
  const activatorCharacterInstanceId = summonActor.cardInstanceId
  const summonHandCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${activatorCharacterInstanceId}"]`)
  await summonHandCard.hover()
  await summonHandCard.getByRole('button', { name: /^summon$/i }).click()

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, activator.session.accessToken)
    return resolvePlayerState(state, activator).characterField
      .some((card) => card.instanceId === activatorCharacterInstanceId)
  }, {
    timeout: 12_000,
  }).toBe(true)

  // 3. The K.O. support goes into the support area (hand activation would trash the card, and then there
  //    would be nothing left in the row for the negate to point at).
  const koSupportInstanceId = await setSupportFromHand(
    request,
    setup,
    pages,
    activator,
    ACTIVATOR_KO_SUPPORT_CARD_DEFINITION_ID,
  )

  // 4. Activating it from the support area queues the effect and hands priority to the negator - the
  //    "[Support Activated]" window the negate answers.
  await activateSupportFromSupportZone(request, setup, activatorPage, activator, koSupportInstanceId)
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, negator.session.accessToken)
    return state.isSupportResponseWindowOpen === true
  }, {
    timeout: 12_000,
  }).toBe(true)

  // A lone activation opens the window but is not a chain yet: the bubble stays out of the way until
  // someone actually answers inside the window.
  await expect(negatorPage.getByTestId('support-chain-bubble')).toHaveCount(0)

  // 5. The support row is measured on the negator's screen: the opponent's (top) row holds the card the
  //    negate has to target.
  const slotsBeforeTargeting = await measureSupportRowSlots(negatorPage, 'top')
  const targetCard = negatorPage.locator(
    `[data-zone="support"][data-slot-side="top"][data-card-instance-id="${koSupportInstanceId}"]`,
  )
  await expect(targetCard).toBeVisible()
  const targetCardBoxBefore = await measureLocatorBox(targetCard)
  expect(await targetCard.evaluate((element) => element.classList.contains('battle-target-top'))).toBe(false)

  await clickSupportZoneCardAction(request, setup, negatorPage, negator, NEGATOR_NEGATE_CARD_DEFINITION_ID)

  // 6. The negate target highlights: the card keeps its size, its slot and the row keeps every track.
  await expect.poll(async () => {
    return await targetCard.evaluate((element) => element.classList.contains('battle-target-top'))
  }, {
    timeout: 12_000,
  }).toBe(true)

  await negatorPage.mouse.move(0, 0)
  await wait(200)

  expect(await measureSupportRowSlots(negatorPage, 'top')).toEqual(slotsBeforeTargeting)
  expect(await measureLocatorBox(targetCard)).toEqual(targetCardBoxBefore)

  // 7. Choosing the target negates the activation: the K.O. never happens, so the character stays.
  await targetCard.hover()
  await targetCard.getByRole('button', { name: /^choose$/i }).click()

  // 8. The negate queues: the chain now has two activations, so the bubble pops up over the board and
  //    spells out who is answering whom.
  const chainBubble = negatorPage.getByTestId('support-chain-bubble')
  await expect(chainBubble).toBeVisible({ timeout: 12_000 })
  await expect(negatorPage.getByTestId('support-chain-entry')).toHaveCount(2)
  await expect(chainBubble).toContainText('2 activations')

  const firstChainEntry = negatorPage.locator('[data-testid="support-chain-entry"][data-entry-sequence="1"]')
  await expect(firstChainEntry).toContainText('Sasuke Uchiha')
  await expect(firstChainEntry).toContainText('Opponent')

  const secondChainEntry = negatorPage.locator('[data-testid="support-chain-entry"][data-entry-sequence="2"]')
  await expect(secondChainEntry).toContainText('Kakashi Hatake')
  await expect(secondChainEntry).toContainText('You')
  await expect(secondChainEntry.getByTestId('support-chain-negate-link')).toHaveText('⚡ Negates #1 Sasuke Uchiha')

  // A support in the chain cannot be activated again: its Support button is gone while the chain is open.
  await expectSupportChipRemoved(activatorPage, koSupportInstanceId)

  await passUntilSupportWindowCloses(request, setup, negator, koSupportInstanceId)

  // The chain resolved, so the bubble is gone again.
  await expect(chainBubble).toHaveCount(0)

  const stateAfterResolution = await fetchGameState(request, setup.gameCode, activator.session.accessToken)
  expect(resolvePlayerState(stateAfterResolution, activator).characterField
    .some((card) => card.instanceId === activatorCharacterInstanceId)).toBe(true)
}

/**
 * The negate answers the queued activation, so the roles are fixed by the decks: player one holds N-009
 * (deck "one"), player two holds the "K.O. all Characters" support it negates (deck "two"). Neither opening
 * hand is guaranteed to hold its half, so turns are advanced - both players draw two cards from turn 2 on -
 * until both do.
 */
async function resolveNegateRoles(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<{
  negator: MultiplayerSetup['playerOne']
  activator: MultiplayerSetup['playerOne']
  plainSummonCardDefinitionId: string
}> {
  for (let cycle = 0; cycle < ROLE_SEARCH_CYCLE_COUNT; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const holdsCard = (state: typeof playerOneState, player: MultiplayerSetup['playerOne'], cardDefinitionId: string) =>
      resolvePlayerState(state, player).hand.some((card) =>
        (card.cardDefinitionId ?? '').trim().toUpperCase() === cardDefinitionId)

    const negatorHoldsNegate = holdsCard(playerOneState, setup.playerOne, NEGATOR_NEGATE_CARD_DEFINITION_ID)
    const activatorHoldsKoSupport = holdsCard(playerTwoState, setup.playerTwo, ACTIVATOR_KO_SUPPORT_CARD_DEFINITION_ID)
    const plainSummonCardDefinitionId = ACTIVATOR_PLAIN_SUMMON_CARD_DEFINITION_IDS
      .find((cardDefinitionId) => holdsCard(playerTwoState, setup.playerTwo, cardDefinitionId))

    if (negatorHoldsNegate && activatorHoldsKoSupport && plainSummonCardDefinitionId) {
      return { negator: setup.playerOne, activator: setup.playerTwo, plainSummonCardDefinitionId }
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error('The negate play did not come together within the search window.')
}

/** Sets a hand card face down in the support area and returns its card instance id. */
async function setSupportFromHand(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actor: MultiplayerSetup['playerOne'],
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
    timeout: 12_000,
  }).toBe(true)

  return setSupportActor.cardInstanceId
}

/** Waits for the support-zone activation to become available on the actor's turn, then clicks its chip. */
async function activateSupportFromSupportZone(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  actorPage: Page,
  actor: MultiplayerSetup['playerOne'],
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

/** Clicks the "Support" chip of a card sitting in the actor's own support area. */
async function clickSupportZoneCardAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  actorPage: Page,
  actor: MultiplayerSetup['playerOne'],
  cardDefinitionId: string,
): Promise<string> {
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return resolvePlayerState(state, actor).supportZone.some((card) =>
      (card.cardDefinitionId ?? '').trim().toUpperCase() === cardDefinitionId)
  }, {
    timeout: 12_000,
  }).toBe(true)

  const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
  const supportCard = resolvePlayerState(state, actor).supportZone.find((card) =>
    (card.cardDefinitionId ?? '').trim().toUpperCase() === cardDefinitionId)

  if (!supportCard) {
    throw new Error(`Support card '${cardDefinitionId}' is not in ${actor.userId}'s support area.`)
  }

  const supportZoneCard = actorPage.locator(
    `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${supportCard.instanceId}"]`,
  )
  await expect(supportZoneCard).toBeVisible({ timeout: 12_000 })
  await expect.poll(async () => (supportCard.availableActions ?? [])
    .some((action) => action.isEnabled && action.actionId.startsWith('activate-support:')), {
    timeout: 12_000,
  }).toBe(true)

  await supportZoneCard.hover()
  await supportZoneCard.getByRole('button', { name: /^support$/i }).click()

  return supportCard.instanceId
}

/**
 * Slot geometry of one support row, one entry per slot: the occupied card when the slot holds one, the empty
 * placeholder otherwise. Nested matches (an empty slot renders a button *and* a placeholder card inside it)
 * are dropped so every slot reports exactly once. Rounded to a tenth of a pixel - sub-pixel jitter is not
 * what this spec is about.
 */
async function measureSupportRowSlots(page: Page, side: 'top' | 'bottom'): Promise<SlotGeometry[]> {
  return await page.evaluate((rowSide: 'top' | 'bottom') => {
    const selector = `[data-zone="support"][data-slot-side="${rowSide}"][data-slot-index]`
    const nodes = Array.from(document.querySelectorAll(selector))
      .filter((node) => !(node.parentElement?.closest(selector)))
    return nodes
      .map((node) => {
        const rect = node.getBoundingClientRect()
        return {
          slotIndex: Number.parseInt(node.getAttribute('data-slot-index') ?? '-1', 10),
          x: Math.round(rect.left * 10) / 10,
          y: Math.round(rect.top * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        }
      })
      .sort((left, right) => left.slotIndex - right.slotIndex)
  }, side)
}

async function measureLocatorBox(locator: Locator): Promise<SlotGeometry | null> {
  const box = await locator.boundingBox()
  if (!box) {
    return null
  }

  return {
    slotIndex: -1,
    x: Math.round(box.x * 10) / 10,
    y: Math.round(box.y * 10) / 10,
    width: Math.round(box.width * 10) / 10,
    height: Math.round(box.height * 10) / 10,
  }
}

/** Passes through the cut-in window until the negated activation resolved and the used support hit the trash. */
async function passUntilSupportWindowCloses(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  supportOwner: MultiplayerSetup['playerOne'],
  supportInstanceId: string,
): Promise<void> {
  for (let step = 0; step < 12; step += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const ownerState = supportOwner.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const resolvedOwnerState = resolvePlayerState(ownerState, supportOwner)
    const supportLeftSupportArea = !resolvedOwnerState.supportZone.some((card) => card.instanceId === supportInstanceId)

    if (supportLeftSupportArea && ownerState.isSupportResponseWindowOpen !== true) {
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
