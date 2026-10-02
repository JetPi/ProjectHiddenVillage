import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
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

// N-001 (Naruto Uzumaki) is the seeded leader of deck "one" (player one). Its rules text is
//   "[Recovery] If it is the second turn or later, rest this card and flip all of your CHAKRA face-up."
// authored as an `AlterResources` node with `operation: Recover, amount: 5`, the
// `isSecondTurnOrLater` execution condition and `executionTargetSource: None`. The mapper publishes it on
// the leader as `leader-effect:{instanceId}:recovery` with the label "Recovery"; the registry supplies the
// `isSecondTurnOrLater` argument the condition reads and pays the ability's rest (ChakraRecoveryRules).
// The test name is the original one: it also pins "chakra never comes back on its own".
const LEADER_RECOVERY_EFFECT_SUFFIX = ':recovery'
const LEADER_RECOVERY_BUTTON_NAME = 'Activate leader recovery'
const FIRST_TURN_RECOVERY_REASON = 'Recovery can only be activated starting from your second turn.'
const ALL_CHAKRA_FACE_UP_REASON = 'All chakra cards are already face up.'

// The chakra pool is 5 face-up cards; nothing flips them back automatically ("Chakra DOES NOT
// automatically flip face-up at the start of your turn" / "There is no passive chakra recovery"), so the
// leader's Recovery is the only way back up and the spec pins both numbers.
const FULL_CHAKRA_POOL = 5
const CHAKRA_POOL_AFTER_ONE_COST = FULL_CHAKRA_POOL - 1

// A character has to be drawn to have something for the leader's targeted power-up to spend chakra on.
const SCENARIO_ATTEMPT_COUNT = 3

test.describe('GameView multiplayer leader recovery', () => {
  test.describe.configure({ timeout: 300_000 })

  test('Recovery is refused on the first turn, becomes available from the second, and chakra never comes back on its own', async ({ browser, request }) => {
    let lastFailure: unknown = null

    for (let attempt = 0; attempt < SCENARIO_ATTEMPT_COUNT; attempt += 1) {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)

      try {
        await playLeaderRecoveryScenario(request, setup, pages)
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

async function playLeaderRecoveryScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
  await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

  await advanceToMulliganPromptIfNeeded(request, setup)
  await resolveAllMulliganPrompts(request, setup, 'noMulligan')

  // 1. The first turn: the mapper's `player.TurnCount < 2` gate refuses the activation outright, so the
  //    chip must publish disabled with that reason (and the board must render it disabled).
  await waitForActorMainPhaseNumber(request, setup, setup.playerOne, 1)
  const firstTurnRecovery = await readRecoveryAction(request, setup)
  expect(firstTurnRecovery.isEnabled).toBe(false)
  expect(firstTurnRecovery.disabledReason).toBe(FIRST_TURN_RECOVERY_REASON)

  const leaderCard = pages.playerOnePage.locator('[data-zone="leader-card"][data-slot-side="bottom"]')
  await expect(leaderCard).toBeVisible({ timeout: 15_000 })
  await leaderCard.hover()
  const recoveryButton = leaderCard.getByRole('button', { name: LEADER_RECOVERY_BUTTON_NAME })
  await expect(recoveryButton).toBeVisible({ timeout: 10_000 })
  await expect(recoveryButton).toBeDisabled()
  await expect(recoveryButton).toHaveAttribute('title', FIRST_TURN_RECOVERY_REASON)

  // 2. Spend one chakra with the leader's own "[Activate: Main] Flip 1 of your CHAKRA face-down and choose
  //    1 Character: +3 power this turn" so the pool is no longer full.
  await summonAnyCharacter(request, setup, pages, setup.playerOne)
  expect(await readChakraPool(request, setup, setup.playerOne)).toBe(FULL_CHAKRA_POOL)
  await activateLeaderPowerUp(request, setup, pages)
  expect(await readChakraPool(request, setup, setup.playerOne)).toBe(CHAKRA_POOL_AFTER_ONE_COST)

  // 3. The actor's next turn: the pool is still one short at the Refresh Phase ("Chakra DOES NOT
  //    automatically flip face-up at the start of your turn" / "There is no passive chakra recovery"), and
  //    with face-down chakra around the same chip is now legal - in the payload and on the board.
  await waitForActorMainPhaseNumber(request, setup, setup.playerOne, 2)
  expect(await readChakraPool(request, setup, setup.playerOne)).toBe(CHAKRA_POOL_AFTER_ONE_COST)

  await expect.poll(async () => {
    const recovery = await readRecoveryAction(request, setup)
    return recovery.isEnabled
  }, { timeout: 15_000 }).toBe(true)

  await leaderCard.hover()
  await expect(recoveryButton).toBeEnabled({ timeout: 10_000 })

  // 4. Activating the chip now really recovers: the authored node's `isSecondTurnOrLater` execution
  //    condition is matched against an argument the server derives from the acting player's turn count
  //    (`ExecuteCardAction`), and "Recover 5" is clamped to the five chakra cards a player owns, so a pool
  //    one short tops back up to full. "[Recovery] ... rest this card" is paid as part of the ability.
  await recoveryButton.click()

  await expect.poll(async () => {
    return await readChakraPool(request, setup, setup.playerOne)
  }, { timeout: 15_000 }).toBe(FULL_CHAKRA_POOL)

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    return resolvePlayerState(state, setup.playerOne).leader.isRested
  }, { timeout: 10_000 }).toBe(true)

  // The board draws the rest, not just the payload: the leader has its own, gentler rested tilt
  // (`LEADER_RESTED_ROTATION_CLASS` = `rotate-[5deg]`; the battlefield cards use `rotate-[14deg]`).
  await expect.poll(async () => {
    return await leaderCard.getAttribute('class')
  }, { timeout: 10_000 }).toContain('rotate-[5deg]')

  // 5. With every chakra card face up the same chip publishes disabled again, which is the recovered pool's
  //    own proof: the number on the board came back, and the ability cannot overshoot the five cards.
  await expect.poll(async () => {
    const recovery = await readRecoveryAction(request, setup)
    return recovery.disabledReason
  }, { timeout: 15_000 }).toBe(ALL_CHAKRA_FACE_UP_REASON)

  await leaderCard.hover()
  await expect(recoveryButton).toBeDisabled({ timeout: 10_000 })
}
async function readChakraPool(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  player: MultiplayerSetup['playerOne'],
): Promise<number> {
  const state = await fetchGameState(request, setup.gameCode, player.session.accessToken)
  return resolvePlayerState(state, player).resourcePool
}

/** Reads the leader's published Recovery action (label "Recovery", id `leader-effect:*:recovery`). */
async function readRecoveryAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<{ isEnabled: boolean; disabledReason: string | null }> {
  const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  const recoveryAction = (resolvePlayerState(state, setup.playerOne).leader.availableActions ?? [])
    .find((action) => action.actionId.endsWith(LEADER_RECOVERY_EFFECT_SUFFIX))

  if (!recoveryAction) {
    throw new Error(`The leader published no '${LEADER_RECOVERY_EFFECT_SUFFIX}' action.`)
  }

  return {
    isEnabled: recoveryAction.isEnabled,
    disabledReason: recoveryAction.disabledReason ?? null,
  }
}

/** Summons any enabled hand character through its hover chip and returns its instance id. */
async function summonAnyCharacter(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actor: MultiplayerSetup['playerOne'],
): Promise<string> {
  const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
    actorUserId: actor.userId,
  })

  const handCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
  await handCard.hover()
  await handCard.getByRole('button', { name: /^summon$/i }).click()

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, actor.session.accessToken)
    return resolvePlayerState(state, actor).characterField
      .some((card) => card.instanceId === summonActor.cardInstanceId)
  }, { timeout: 15_000 }).toBe(true)

  return summonActor.cardInstanceId
}

/** Runs the leader's targeted "+3 power this turn" ability on the only character on its own field. */
async function activateLeaderPowerUp(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  const leaderState = resolvePlayerState(state, setup.playerOne)
  const powerUpAction = (leaderState.leader.availableActions ?? []).find((action) =>
    action.isEnabled
    && action.actionId.startsWith('leader-effect:')
    && !action.actionId.endsWith(LEADER_RECOVERY_EFFECT_SUFFIX))

  if (!powerUpAction) {
    throw new Error('The leader published no enabled non-Recovery effect to spend chakra on.')
  }

  const targetCardInstanceId = leaderState.characterField[0]?.instanceId
  if (!targetCardInstanceId) {
    throw new Error('The actor has no character on the field for the leader effect.')
  }

  const leaderCard = pages.playerOnePage.locator('[data-zone="leader-card"][data-slot-side="bottom"]')
  await expect(leaderCard).toBeVisible({ timeout: 15_000 })
  await leaderCard.hover()

  const effectButton = leaderCard.getByRole('button', { name: powerUpAction.label, exact: true })
  await expect(effectButton).toBeEnabled({ timeout: 10_000 })
  await effectButton.click()

  const targetCard = pages.playerOnePage.locator(
    `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${targetCardInstanceId}"]`,
  )
  await expect(targetCard).toBeVisible({ timeout: 10_000 })
  await targetCard.hover()
  await targetCard.getByRole('button', { name: /^choose$/i }).click()

  await expect.poll(async () => {
    return await readChakraPool(request, setup, setup.playerOne)
  }, { timeout: 15_000 }).toBe(CHAKRA_POOL_AFTER_ONE_COST)
}

