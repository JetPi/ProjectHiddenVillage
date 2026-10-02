import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  declarePassInActionStepViaHub,
  fetchGameState,
  openMultiplayerPages,
  resolveActorWithBottomHandAction,
  resolveAllMulliganPrompts,
  resolvePlayerState,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
  waitForActorMainPhaseNumber,
} from './helpers/gameviewMultiplayerHelpers'
import type { MultiplayerPages, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// N-007 (Minato Namikaze, deck "one" / player one) carries two mutually exclusive continuous passives:
//   "[Your Turn] If this Character has 10 or more power, this Character gains [Rush]."
// authored as `remove-rush` (Power < 10) and `gain-rush` (Power >= 10) with `passiveMode: Continuous` and
// `passiveReevaluation.triggerKinds: [Any]`. The engine re-evaluates them after *any* mutation
// (`GamePassiveEffectService.ShouldReevaluate`), so the leader's own +3 power must flip the card over the
// threshold and publish an enabled `battle-action:` chip for a card that entered the field this turn.
const CONDITIONAL_RUSH_CARD_DEFINITION_ID = 'N-007'
const CONDITIONAL_RUSH_THRESHOLD = 10
const LEADER_POWER_UP_EFFECT_SUFFIX = ':power-up-card'

// `BattleActionRules.DescribeRestriction(EnteredFieldThisTurn)`: what a summon-sick card without Rush
// reads. The board hides the reason behind the chip's title, and the payload publishes it directly.
const SUMMONED_THIS_TURN_REASON = 'Cannot declare battle action the turn that the card entered the field.'

// Minato Namikaze has to be drawn (three copies in a 33+ card deck) and the summoner must be past their
// first turn, so every attempt plays a fresh game and tries again.
const SCENARIO_ATTEMPT_COUNT = 3

test.describe('GameView multiplayer conditional rush', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a power boost lifts a summon-sick character over its Rush threshold in the same main phase', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < SCENARIO_ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playConditionalRushScenario(request, setup, pages)
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
async function playConditionalRushScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
  await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

  await advanceToMulliganPromptIfNeeded(request, setup)
  await resolveAllMulliganPrompts(request, setup, 'noMulligan')

  // Player one is the deck that holds Minato. Their *second* turn is the earliest where the first-turn
  // battle ban no longer hides the summon-turn rule, which is the rule conditional Rush exists to bypass.
  await waitForActorMainPhaseNumber(request, setup, setup.playerOne, 2)
  const summoningPage = pages.playerOnePage

  const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
    actorUserId: setup.playerOne.userId,
    cardDefinitionId: CONDITIONAL_RUSH_CARD_DEFINITION_ID,
  })
  const handCard = summoningPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
  await handCard.hover()
  await handCard.getByRole('button', { name: /^summon$/i }).click()

  await expect.poll(async () => {
    return await readPower(request, setup, summonActor.cardInstanceId)
  }, { timeout: 15_000 }).toBe(8)

  // Power 8 is below the threshold, so the passive's remove variant holds and the freshly summoned card
  // may not attack: the chip is published disabled with the summon-turn reason (not the first-turn one -
  // that would mean the turn count was wrong and the assertion after the boost would be meaningless).
  const beforeBoost = await readBattleAction(request, setup, summonActor.cardInstanceId)
  expect(beforeBoost.isEnabled).toBe(false)
  expect(beforeBoost.disabledReason).toBe(SUMMONED_THIS_TURN_REASON)

  // The leader's own "[Activate: Main] Flip 1 of your CHAKRA face-down and choose 1 Character: +3 power
  // during this turn" is the boost that crosses the threshold ("During This Turn" + Change Values, so the
  // engine reports a stat mutation and the continuous passive re-evaluates immediately).
  await activateLeaderPowerUp(request, setup, pages, summonActor.cardInstanceId)

  await expect.poll(async () => {
    return await readPower(request, setup, summonActor.cardInstanceId)
  }, { timeout: 15_000 }).toBeGreaterThanOrEqual(CONDITIONAL_RUSH_THRESHOLD)

  await expect.poll(async () => {
    const battleAction = await readBattleAction(request, setup, summonActor.cardInstanceId)
    return battleAction.isEnabled
  }, { timeout: 15_000 }).toBe(true)

  const attackDamage = await readDamage(request, setup, summonActor.cardInstanceId)
  expect(attackDamage).toBeGreaterThan(0)
  const opposingLeaderLifeBefore = await readLeaderLife(request, setup, setup.playerTwo)

  // The Rush proof: click the chip that was disabled a moment ago and attack on the summon turn.
  await declareAttackOnOpposingLeader(request, setup, pages, summonActor.cardInstanceId)
  await passThroughActionStep(request, setup)
  await waitForMainPhase(request, setup)

  const opposingLeaderLifeAfter = await readLeaderLife(request, setup, setup.playerTwo)
  expect(opposingLeaderLifeAfter).toBe(opposingLeaderLifeBefore - attackDamage)

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    const card = resolvePlayerState(state, setup.playerOne).characterField
      .find((entry) => entry.instanceId === summonActor.cardInstanceId)
    return card?.isRested === true
  }, { timeout: 15_000 }).toBe(true)
}
async function readPower(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  cardInstanceId: string,
): Promise<number | null> {
  const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  const card = resolvePlayerState(state, setup.playerOne).characterField
    .find((entry) => entry.instanceId === cardInstanceId)
  return card?.power ?? null
}

async function readDamage(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  cardInstanceId: string,
): Promise<number> {
  const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  const card = resolvePlayerState(state, setup.playerOne).characterField
    .find((entry) => entry.instanceId === cardInstanceId)
  return card?.damage ?? 0
}

async function readBattleAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  cardInstanceId: string,
): Promise<{ isEnabled: boolean; disabledReason: string | null }> {
  const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  const card = resolvePlayerState(state, setup.playerOne).characterField
    .find((entry) => entry.instanceId === cardInstanceId)
  const battleAction = (card?.availableActions ?? [])
    .find((action) => action.actionId === `battle-action:${cardInstanceId}`)

  if (!battleAction) {
    throw new Error(`Card '${cardInstanceId}' published no battle action.`)
  }

  return {
    isEnabled: battleAction.isEnabled,
    disabledReason: battleAction.disabledReason ?? null,
  }
}

async function readLeaderLife(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  player: MultiplayerSetup['playerOne'],
): Promise<number> {
  const state = await fetchGameState(request, setup.gameCode, player.session.accessToken)
  return resolvePlayerState(state, player).leader.currentLife ?? 0
}

/** Runs the leader's targeted "+3 power this turn" effect on the given battlefield card. */
async function activateLeaderPowerUp(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  targetCardInstanceId: string,
): Promise<void> {
  const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  const leader = resolvePlayerState(state, setup.playerOne).leader
  const powerUpAction = (leader.availableActions ?? []).find((action) =>
    action.isEnabled && action.actionId.endsWith(LEADER_POWER_UP_EFFECT_SUFFIX))

  if (!powerUpAction) {
    throw new Error(`The leader power-up effect '${LEADER_POWER_UP_EFFECT_SUFFIX}' was not available.`)
  }

  const leaderCard = pages.playerOnePage.locator('[data-zone="leader-card"][data-slot-side="bottom"]')
  await expect(leaderCard).toBeVisible({ timeout: 15_000 })
  await leaderCard.hover()

  const effectButton = leaderCard.getByRole('button', { name: powerUpAction.label, exact: true })
  await expect(effectButton).toBeEnabled({ timeout: 10_000 })
  await effectButton.click()

  // The effect's single pick renders as a "Choose" chip on each valid character (see
  // `NonLeaderCardOverlay`), exactly like an attack target.
  const targetCard = pages.playerOnePage.locator(
    `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${targetCardInstanceId}"]`,
  )
  await expect(targetCard).toBeVisible({ timeout: 10_000 })
  await targetCard.hover()
  await targetCard.getByRole('button', { name: /^choose$/i }).click()
}
/** Declares the attack on the opposing leader through the card's hover chip and the leader's "Choose". */
async function declareAttackOnOpposingLeader(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  attackerInstanceId: string,
): Promise<void> {
  const attackerCard = pages.playerOnePage.locator(
    `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${attackerInstanceId}"]`,
  )
  await expect(attackerCard).toBeVisible({ timeout: 10_000 })
  await attackerCard.hover()
  await attackerCard.getByRole('button', { name: /^battle$/i }).click()

  await expect(pages.playerOnePage.getByTestId('cancel-target-mode-button')).toBeVisible({ timeout: 10_000 })

  const opposingLeader = pages.playerOnePage.locator('[data-zone="leader-card"][data-slot-side="top"]')
  await expect(opposingLeader).toBeVisible({ timeout: 10_000 })
  await opposingLeader.hover()
  await opposingLeader.getByRole('button', { name: /^choose$/i }).click()

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    return state.isAttackSequencePending === true
  }, { timeout: 15_000 }).toBe(true)
}

async function waitForActionStep(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<void> {
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    return state.phase
  }, { timeout: 10_000 }).toBe('ActionStep')
}

/**
 * The attack cut-in window closes on the second pass (`DeclarePassInActionStep`), so both players have to
 * decline before the damage step runs. Mirrors `gameview.multiplayer.attack-sequence.spec.ts`: wait for
 * the declaration to appear as `ActionStep` first, then keep offering a pass whenever a snapshot does.
 */
async function passThroughActionStep(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<void> {
  await waitForActionStep(request, setup)

  for (let step = 0; step < 12; step += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    if (playerOneState.phase !== 'ActionStep') {
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

    await wait(300)
  }
}

async function waitForMainPhase(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<void> {
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    return state.phase
  }, { timeout: 25_000 }).toBe('MainPhase')
}



