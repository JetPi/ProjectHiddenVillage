import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
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
  waitForActorMainPhaseNumber,
} from './helpers/gameviewMultiplayerHelpers'
import type { MultiplayerPages, MultiplayerSetup, PlayerAuth } from './helpers/gameviewMultiplayerHelpers'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Deck "one" (player one) opens with N-004 Naruto Uzumaki, "[Support] Rasengan | [During Your Main] K.O.
// all Characters" (cost 2, `autoSelectAllValidTargets`, so it never asks for a pick). It is set face down
// first so that it is still sitting in the opener's support row while it is queued - `Negate Effect` can
// only target a card in a Support Zone.
const OPENER_KO_SUPPORT_CARD_DEFINITION_ID = 'N-004'
// Deck "two" (player two) answers with N-016 Shisui Uchiha, "[Support Activated] Negate that card. Then,
// from this turn until the end of your next turn's End Phase, you cannot turn your CHAKRA face-up."
const NEGATER_NEGATE_SUPPORT_CARD_DEFINITION_ID = 'N-016'
// N-004 itself is excluded: the role search keeps that copy for the opening activation.
const OPENER_PLAIN_SUMMON_CARD_DEFINITION_IDS: readonly string[] = [
  'N-002',
  'N-006',
  'N-007',
  'N-008',
  'N-011',
  'N-018',
]

const FULL_CHAKRA_POOL = 5
const KO_SUPPORT_COST = 2
const NEGATE_SUPPORT_COST = 1
const RECOVERY_EFFECT_SUFFIX = ':recovery'
// `GameStateResponseMapper.EffectAvailability`: the N-016 chakra lock disables Recovery outright, and the
// first-turn gate is what the same chip reads before a player's second turn - so the assertion below only
// means something while both are distinguishable.
const CHAKRA_LOCK_REASON = 'Your chakra is locked and cannot be turned face-up.'

const SCENARIO_ATTEMPT_COUNT = 3
const ROLE_SEARCH_CYCLE_COUNT = 30

test.describe('GameView multiplayer negate support and chakra lock', () => {
  test.describe.configure({ timeout: 300_000 })

  test('N-016 negates the queued K.O. and locks only its own activator out of chakra recovery', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < SCENARIO_ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playNegateChakraLockScenario(request, setup, pages)
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
async function playNegateChakraLockScenario(
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
  const negater = setup.playerTwo
  const openerPage = pages.playerOnePage
  const negaterPage = pages.playerTwoPage

  // 1. The negater's half: N-016 face down in their own support area (a support played on the opponent's
  //    turn must come from the support area).
  await waitForMainPhase(request, setup, negater)
  const negateSupportInstanceId = await setSupportFromHand(
    request,
    setup,
    pages,
    negater,
    NEGATER_NEGATE_SUPPORT_CARD_DEFINITION_ID,
  )

  // 2. The opener's half: a character for the K.O. to hit (proving it really resolved, or really did not)
  //    and the K.O. support face down in their own support area so it stays targetable while queued.
  await waitForMainPhase(request, setup, opener)
  const koVictimInstanceId = await summonFirstAvailableCharacter(request, setup, pages, opener)
  const koSupportInstanceId = await setSupportFromHand(
    request,
    setup,
    pages,
    opener,
    OPENER_KO_SUPPORT_CARD_DEFINITION_ID,
  )

  // 3. Activate it on the opener's *next* turn. Both supports have been face down since their own MainPhase,
  //    so nothing about the setup is still in the activation's way.
  await waitForActorMainPhaseNumber(request, setup, opener, 2)
  await expect.poll(async () => {
    return await isSupportActivationEnabled(request, setup, opener, koSupportInstanceId)
  }, { timeout: 15_000 }).toBe(true)
  await activateSupportFromSupportZone(openerPage, koSupportInstanceId)

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, negater.session.accessToken)
    return state.isSupportResponseWindowOpen === true
  }, { timeout: 15_000 }).toBe(true)

  // 4. The negater's own answer: the "[Support Activated]" chip has to be published enabled for the
  //    opponent of the turn player while the window waits.
  await expect.poll(async () => {
    return await isSupportActivationEnabled(request, setup, negater, negateSupportInstanceId)
  }, { timeout: 15_000 }).toBe(true)

  const negateSupportCard = negaterPage.locator(
    `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${negateSupportInstanceId}"]`,
  )
  await expect(negateSupportCard).toBeVisible()
  await negateSupportCard.hover()
  await negateSupportCard.getByRole('button', { name: /^support$/i }).click()

  // The negate asks for the queued activation, which is the opener's card in *their* support row.
  const queuedSupportCard = negaterPage.locator(
    `[data-zone="support"][data-slot-side="top"][data-card-instance-id="${koSupportInstanceId}"]`,
  )
  await expect(queuedSupportCard).toBeVisible({ timeout: 10_000 })
  await queuedSupportCard.hover()
  await queuedSupportCard.getByRole('button', { name: /^choose$/i }).click()

  // One decline from the activator closes the window; the chain resolves LIFO, so the negate lands before
  // the K.O. and the K.O. itself is stamped as negated.
  await passUntilChainCloses(request, setup, opener)

  const openerState = await fetchGameState(request, setup.gameCode, opener.session.accessToken)
  const resolvedOpener = resolvePlayerState(openerState, opener)
  expect(resolvedOpener.characterField.some((card) => card.instanceId === koVictimInstanceId)).toBe(true)
  expect(resolvedOpener.trash.some((card) => card.instanceId === koVictimInstanceId)).toBe(false)
  expect(resolvedOpener.supportZone.some((card) => card.instanceId === koSupportInstanceId)).toBe(false)
  expect(resolvedOpener.resourcePool).toBe(FULL_CHAKRA_POOL - KO_SUPPORT_COST)

  // The contrast for the lock below: the opener paid 2 chakra and has face-down chakra, so *their* Recovery
  // chip is enabled on the very same turn the negate resolved.
  const openerRecovery = await readRecoveryAction(opener, openerState)
  expect(openerRecovery.isEnabled).toBe(true)

  const negaterState = await fetchGameState(request, setup.gameCode, negater.session.accessToken)
  const resolvedNegater = resolvePlayerState(negaterState, negater)
  expect(resolvedNegater.supportZone.some((card) => card.instanceId === negateSupportInstanceId)).toBe(false)
  expect(resolvedNegater.resourcePool).toBe(FULL_CHAKRA_POOL - NEGATE_SUPPORT_COST)

  // 5. The drawback. The lock was applied by the negater and lasts until the end of their next turn's End
  //    Phase, so their Recovery must still be refused on that turn while the pool is visibly face-down.
  await waitForActorMainPhaseNumber(request, setup, negater, 1)
  const lockedState = await fetchGameState(request, setup.gameCode, negater.session.accessToken)
  expect(resolvePlayerState(lockedState, negater).resourcePool).toBe(FULL_CHAKRA_POOL - NEGATE_SUPPORT_COST)

  const lockedRecovery = await readRecoveryAction(negater, lockedState)
  expect(lockedRecovery.isEnabled).toBe(false)
  expect(lockedRecovery.disabledReason).toBe(CHAKRA_LOCK_REASON)

  const negaterLeaderCard = negaterPage.locator('[data-zone="leader-card"][data-slot-side="bottom"]')
  await expect(negaterLeaderCard).toBeVisible({ timeout: 15_000 })
  await negaterLeaderCard.hover()
  const recoveryButton = negaterLeaderCard.getByRole('button', { name: 'Activate leader recovery' })
  await expect(recoveryButton).toBeVisible({ timeout: 10_000 })
  await expect(recoveryButton).toBeDisabled()
  await expect(recoveryButton).toHaveAttribute('title', CHAKRA_LOCK_REASON)
}
/** Drives the game forward until the actor's own MainPhase (current or next) is the window. */
async function waitForMainPhase(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  actor: PlayerAuth,
): Promise<void> {
  await waitForActorMainPhaseNumber(request, setup, actor, 1)
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
  }, { timeout: 15_000 }).toBe(true)

  return setSupportActor.cardInstanceId
}

/** Summons the first whitelisted hand character, advancing decision windows while it looks. */
async function summonFirstAvailableCharacter(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actor: PlayerAuth,
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
        OPENER_PLAIN_SUMMON_CARD_DEFINITION_IDS
          .includes((card.cardDefinitionId ?? '').trim().toUpperCase())
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
/** Whether the support-zone card publishes an enabled `activate-support:` chip for that player. */
async function isSupportActivationEnabled(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  actor: PlayerAuth,
  supportInstanceId: string,
): Promise<boolean> {
  const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
  const supportCard = resolvePlayerState(state, actor).supportZone
    .find((card) => card.instanceId === supportInstanceId)

  return (supportCard?.availableActions ?? [])
    .find((action) => action.actionId.startsWith('activate-support:'))?.isEnabled === true
}

/** Clicks the support-zone card's "Support" chip. */
async function activateSupportFromSupportZone(
  page: Page,
  supportInstanceId: string,
): Promise<void> {
  const supportZoneCard = page.locator(
    `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${supportInstanceId}"]`,
  )
  await expect(supportZoneCard).toBeVisible({ timeout: 10_000 })
  await supportZoneCard.hover()
  await supportZoneCard.getByRole('button', { name: /^support$/i }).click()
}

/** Reads the leader's published Recovery action (`leader-effect:*:recovery`, label "Recovery"). */
async function readRecoveryAction(
  player: PlayerAuth,
  state: Awaited<ReturnType<typeof fetchGameState>>,
): Promise<{ isEnabled: boolean; disabledReason: string | null }> {
  const recoveryAction = (resolvePlayerState(state, player).leader.availableActions ?? [])
    .find((action) => action.actionId.endsWith(RECOVERY_EFFECT_SUFFIX))

  if (!recoveryAction) {
    throw new Error(`Player '${player.userId}' published no '${RECOVERY_EFFECT_SUFFIX}' action.`)
  }

  return {
    isEnabled: recoveryAction.isEnabled,
    disabledReason: recoveryAction.disabledReason ?? null,
  }
}

/**
 * Declines the open support window until it closes. One decline closes a MainPhase support window, so the
 * activator's pass is the whole window's answer once the negate has already flipped priority back.
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




