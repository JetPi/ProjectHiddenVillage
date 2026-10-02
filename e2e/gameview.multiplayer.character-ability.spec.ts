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
} from './helpers/gameviewMultiplayerHelpers'
import type { MultiplayerPages, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// N-011 (Ino Yamanaka, deck "one" / player one) carries an *independent battlefield ability*:
//   "[Activate: Main] [Once Per Turn] If you have [Shikamaru Nara] and [Choji Akimichi] on the field, your
//    [Ino Yamanaka], [Shikamaru Nara], and [Choji Akimichi] all gain [Rush] and +5 power/+1 damage during
//    this turn."
// authored as `add-rush` (Gain Effect, Atomic Chain, `contextRules` = Choji + Shikamaru on the field,
// `targetRules` = own field cards named Ino/Shikamaru/Choji with `autoSelectAllValidTargets`) plus the
// subordinate `modify-values` as its on-success chain. The mapper publishes it on the battlefield card as
// `character-ability:{instanceId}:add-rush` - the same shape a leader ability uses - and the engine
// executes it through the shared card-ability path.
const INO_DEFINITION_ID = 'N-011'
const SHIKAMARU_DEFINITION_ID = 'N-008'
const CHOJI_DEFINITION_ID = 'N-002'
const INO_ABILITY_EFFECT_KEY = 'add-rush'

// "+5 power/+1 damage during this turn" (the Damage step of the ability is an attacker's DMG on a leader).
const POWER_BONUS = 5
const DAMAGE_BONUS = 1

// `BattleActionRules.DescribeRestriction(EnteredFieldThisTurn)`: what Ino reads on the turn she is summoned.
// The granted Rush is exactly what flips this chip, so the reason is asserted before and after the ability.
const SUMMONED_THIS_TURN_REASON = 'Cannot declare battle action the turn that the card entered the field.'

// The context rules need two other named characters on the field, and each normal summon is once per turn,
// so the scenario plays at least three of the actor's turns. Every attempt plays a fresh game (and the
// helpers drive the turns forward until the requested card is drawn), so a bad shuffle only costs a retry.
const SCENARIO_ATTEMPT_COUNT = 3

test.describe('GameView multiplayer character ability', () => {
  test.describe.configure({ timeout: 300_000 })

  test('a battlefield card\'s [Activate: Main] ability grants Rush and boosted stats to the team', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < SCENARIO_ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playCharacterAbilityScenario(request, setup, pages)
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
async function playCharacterAbilityScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
  await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

  await advanceToMulliganPromptIfNeeded(request, setup)
  await resolveAllMulliganPrompts(request, setup, 'noMulligan')

  // The ability's context rules need both [Shikamaru Nara] and [Choji Akimichi] on the field, so the team is
  // summoned first. Each call drives the game forward (two draws a turn) until the requested card is in hand
  // with an enabled Summon action, then clicks that chip.
  const shikamaruInstanceId = await summonDefinition(request, setup, pages, SHIKAMARU_DEFINITION_ID)
  const chojiInstanceId = await summonDefinition(request, setup, pages, CHOJI_DEFINITION_ID)
  const inoInstanceId = await summonDefinition(request, setup, pages, INO_DEFINITION_ID)

  // Ino entered the field this turn, so she may not attack yet - the state the ability's Rush is for.
  const summonTurnBattleAction = await readBattleAction(request, setup, inoInstanceId)
  expect(summonTurnBattleAction.isEnabled).toBe(false)
  expect(summonTurnBattleAction.disabledReason).toBe(SUMMONED_THIS_TURN_REASON)

  // Her own ability is still legal (only battle actions care about summon sickness) and the context rules
  // are satisfied, so the battlefield card publishes an enabled `character-ability:` chip.
  const abilityAction = await readCharacterAbilityAction(request, setup, inoInstanceId)
  expect(abilityAction.isEnabled).toBe(true)
  expect(abilityAction.actionId).toBe(`character-ability:${inoInstanceId}:${INO_ABILITY_EFFECT_KEY}`)

  const beforeBoost = await readTeamStats(request, setup, [inoInstanceId, shikamaruInstanceId, chojiInstanceId])

  // Activating a chip no leader ever had: hover the battlefield card and click its own ability button (the
  // label is the authored timing, "Activate Main"). `autoSelectAllValidTargets` means the client sends the
  // resolved candidates itself, so no target picker opens.
  const inoCard = pages.playerOnePage.locator(
    `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${inoInstanceId}"]`,
  )
  await expect(inoCard).toBeVisible({ timeout: 10_000 })
  await inoCard.hover()

  const abilityButton = inoCard.getByRole('button', { name: abilityAction.label, exact: true })
  await expect(abilityButton).toBeEnabled({ timeout: 10_000 })
  await abilityButton.click()

  // "+5 power/+1 damage during this turn" for all three named cards.
  await expect.poll(async () => {
    const afterBoost = await readTeamStats(request, setup, [inoInstanceId, shikamaruInstanceId, chojiInstanceId])
    return {
      ino: afterBoost[inoInstanceId].power === beforeBoost[inoInstanceId].power + POWER_BONUS,
      shikamaru: afterBoost[shikamaruInstanceId].power === beforeBoost[shikamaruInstanceId].power + POWER_BONUS,
      choji: afterBoost[chojiInstanceId].power === beforeBoost[chojiInstanceId].power + POWER_BONUS,
    }
  }, { timeout: 15_000 }).toEqual({ ino: true, shikamaru: true, choji: true })

  await expect.poll(async () => {
    const afterBoost = await readTeamStats(request, setup, [inoInstanceId])
    return afterBoost[inoInstanceId].damage
  }, { timeout: 15_000 }).toBe(beforeBoost[inoInstanceId].damage + DAMAGE_BONUS)

  // The Rush proof: the chip that was disabled a moment ago (summon-turn rule) flips to enabled, so Ino can
  // attack on the very turn she was summoned.
  await expect.poll(async () => {
    const battleAction = await readBattleAction(request, setup, inoInstanceId)
    return battleAction.isEnabled
  }, { timeout: 15_000 }).toBe(true)

  const opposingLeaderLifeBefore = await readLeaderLife(request, setup, setup.playerTwo)
  const boostedDamage = (await readTeamStats(request, setup, [inoInstanceId]))[inoInstanceId].damage

  await declareAttackOnOpposingLeader(request, setup, pages, inoInstanceId)
  await passThroughActionStep(request, setup)
  await waitForMainPhase(request, setup)

  const opposingLeaderLifeAfter = await readLeaderLife(request, setup, setup.playerTwo)
  expect(opposingLeaderLifeAfter).toBe(opposingLeaderLifeBefore - boostedDamage)

  // The ability is "[Once Per Turn]": the same chip publishes disabled with that reason while the MainPhase
  // stays open (the opposing leader is still attackable, so the phase cannot have auto-ended).
  await expect.poll(async () => {
    const afterAttack = await readCharacterAbilityAction(request, setup, inoInstanceId)
    return afterAttack.disabledReason
  }, { timeout: 15_000 }).toBe('This effect can only be used once per turn.')
}

/**
 * Drives the game forward until the requested card is in the actor's hand with an enabled Summon action
 * (`resolveActorWithBottomHandAction` advances the turns itself, two draws at a time), then summons it and
 * returns the new battlefield instance id.
 */
async function summonDefinition(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  definitionId: string,
): Promise<string> {
  const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
    actorUserId: setup.playerOne.userId,
    cardDefinitionId: definitionId,
  })

  const handCard = pages.playerOnePage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
  await handCard.hover()
  await handCard.getByRole('button', { name: /^summon$/i }).click()

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    return resolvePlayerState(state, setup.playerOne).characterField
      .some((card) => card.instanceId === summonActor.cardInstanceId)
  }, { timeout: 15_000 }).toBe(true)

  return summonActor.cardInstanceId
}

/** The live POW/DMG the board shows for the given battlefield cards. */
async function readTeamStats(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  instanceIds: string[],
): Promise<Record<string, { power: number; damage: number }>> {
  const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  const characterField = resolvePlayerState(state, setup.playerOne).characterField
  const stats: Record<string, { power: number; damage: number }> = {}

  for (const instanceId of instanceIds) {
    const card = characterField.find((entry) => entry.instanceId === instanceId)
    if (!card) {
      throw new Error(`Card '${instanceId}' is not on the acting player's character field.`)
    }

    stats[instanceId] = { power: card.power ?? 0, damage: card.damage ?? 0 }
  }

  return stats
}

/** The card's own published ability (`character-ability:{instanceId}:{effectKey}`). */
async function readCharacterAbilityAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  cardInstanceId: string,
): Promise<{ actionId: string; label: string; isEnabled: boolean; disabledReason: string | null }> {
  const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  const card = resolvePlayerState(state, setup.playerOne).characterField
    .find((entry) => entry.instanceId === cardInstanceId)
  const abilityAction = (card?.availableActions ?? [])
    .find((action) => action.actionId.startsWith(`character-ability:${cardInstanceId}:`))

  if (!abilityAction) {
    throw new Error(`Card '${cardInstanceId}' published no character-ability action.`)
  }

  return {
    actionId: abilityAction.actionId,
    label: abilityAction.label,
    isEnabled: abilityAction.isEnabled,
    disabledReason: abilityAction.disabledReason ?? null,
  }
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
 * decline before the damage step runs: wait for the declaration to appear as `ActionStep` first, then keep
 * offering a pass whenever a snapshot does (the read-then-act safe idiom from the attack-sequence spec).
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

