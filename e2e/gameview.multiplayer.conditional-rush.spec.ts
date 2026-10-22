import { expect, test } from '@playwright/test'
import { createFixtureDeck } from './helpers/multiplayer/fixtures'
import type { APIRequestContext, Page } from '@playwright/test'
import {
  closeMultiplayerPages,
  declarePassInActionStepViaHub,
  fetchGameState,
  openMultiplayerPages,
  resolveActorWithBottomHandAction,
  resolvePlayerState,
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
// The same reason as the board localises it for the badge tooltip (`game.zone.status.cannotAttackReason`).
const SUMMONED_THIS_TURN_REASON_TEXT = 'It cannot attack on the turn it enters the field.'

test.describe('GameView multiplayer conditional rush', () => {
  test.describe.configure({ timeout: 300_000 })

  // A deck of only the leader and Minato: the card is in every possible opening hand, and the +3 power that
  // lifts it over the threshold comes from the leader's own `power-up-card`. Nothing here rides a shuffle.
  let minatoDeckId = ''

  test.beforeAll(async ({ request }) => {
    minatoDeckId = await createFixtureDeck(request, ['1x N-001', '24x N-007'])
  })

  test('a power boost lifts a summon-sick character over its Rush threshold in the same main phase', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'default', { one: { deckId: minatoDeckId } })
    const pages = await openMultiplayerPages(browser, setup)

    try {
      await playConditionalRushScenario(request, setup, pages)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
async function playConditionalRushScenario(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
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

  // The board no longer draws a Battle chip it cannot use: the card explains itself with the status rail, so the
  // summon-sick card reads as "cannot attack" with the reason in the badge tooltip instead of a greyed button.
  const summoningCard = summoningPage.locator(
    `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${summonActor.cardInstanceId}"]`,
  )
  await expect(summoningCard).toBeVisible({ timeout: 10_000 })
  const cannotAttackBadge = summoningCard.locator('[data-status-effect="CannotAttack"]')
  await expect(cannotAttackBadge).toBeVisible({ timeout: 10_000 })

  // The icon explains itself on hover: the tooltip states what the status means (for the cannot-attack case it
  // carries the server's own reason), which is the whole point of replacing the greyed-out Battle chip.
  await cannotAttackBadge.hover()
  await expect(summoningPage.getByTestId('card-status-tooltip')).toBeVisible({ timeout: 5_000 })
  await expect(summoningPage.getByTestId('card-status-tooltip')).toContainText('Cannot attack')
  await expect(summoningPage.getByTestId('card-status-tooltip')).toContainText(SUMMONED_THIS_TURN_REASON_TEXT)

  await summoningCard.hover()
  await expect(summoningCard.getByRole('button', { name: /^battle$/i })).toHaveCount(0)

  // Card statuses are public information, so the opponent's board badges the same card in its top row.
  const opponentPage = pages.playerTwoPage
  const opponentCard = opponentPage.locator(
    `[data-zone="character-field-card"][data-slot-side="top"][data-card-instance-id="${summonActor.cardInstanceId}"]`,
  )
  const opponentCannotAttackBadge = opponentCard.locator('[data-status-effect="CannotAttack"]')
  await expect(opponentCannotAttackBadge).toBeVisible({ timeout: 15_000 })

  // The opponent's board receives no card actions at all, so the reason rides on the status itself: their
  // tooltip names the cause instead of falling back to a generic "cannot attack".
  await opponentCannotAttackBadge.hover()
  await expect(opponentPage.getByTestId('card-status-tooltip')).toBeVisible({ timeout: 5_000 })
  await expect(opponentPage.getByTestId('card-status-tooltip')).toContainText(SUMMONED_THIS_TURN_REASON_TEXT)

  // Watch the rail across the boost: the lock leaves and Rush arrives on the same state push, and the order the
  // two chips enter and leave the DOM is what the animation has to respect.
  await installCardStatusTimeline(summoningPage, summonActor.cardInstanceId)

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

  // The granted Rush lands on the board as its own badge, and the restriction badge clears the moment the card
  // can actually declare battle. The chip that reappears here is the one the scenario clicks below.
  const rushBadge = summoningCard.locator('[data-status-effect="Rush"]')
  await expect(rushBadge).toBeVisible({ timeout: 15_000 })
  await expect(summoningCard.locator('[data-status-effect="CannotAttack"]')).toHaveCount(0)

  // A status that replaces another is sequenced, not cross-faded: the outgoing chip has to be gone before the
  // incoming one mounts, otherwise the new badge pops up beside a half-faded one and slides into its slot when
  // that one unmounts.
  const statusTimeline = await readCardStatusTimeline(summoningPage)
  const lockRemovedAt = statusTimeline.findIndex(
    (entry) => entry.type === 'removed' && entry.kind === 'CannotAttack',
  )
  const rushAddedAt = statusTimeline.findIndex((entry) => entry.type === 'added' && entry.kind === 'Rush')
  expect(lockRemovedAt).toBeGreaterThanOrEqual(0)
  expect(rushAddedAt).toBeGreaterThanOrEqual(0)
  expect(lockRemovedAt).toBeLessThan(rushAddedAt)

  await rushBadge.hover()
  await expect(summoningPage.getByTestId('card-status-tooltip')).toBeVisible({ timeout: 5_000 })
  await expect(summoningPage.getByTestId('card-status-tooltip')).toContainText('Rush')

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
type CardStatusTimelineEntry = {
  type: 'added' | 'removed'
  kind: string
}

/**
 * Records the order in which a card's status chips are added to and removed from the DOM. The rail animates the
 * swap, so those two mutations are the observable contract: a badge that replaces another may only be added after
 * the outgoing chip was removed.
 */
async function installCardStatusTimeline(page: Page, cardInstanceId: string): Promise<void> {
  await page.evaluate((instanceId) => {
    const card = document.querySelector(
      `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${instanceId}"]`,
    )

    if (card === null) {
      throw new Error(`Card ${instanceId} is not on the board.`)
    }

    const timeline: Array<{ type: 'added' | 'removed'; kind: string }> = []
    ;(window as unknown as { __cardStatusTimeline?: typeof timeline }).__cardStatusTimeline = timeline

    const capture = (type: 'added' | 'removed') => (node: Node): void => {
      if (!(node instanceof HTMLElement)) {
        return
      }

      const kind = node.getAttribute('data-status-effect')
      if (kind !== null) {
        timeline.push({ type, kind })
      }
    }

    new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach(capture('added'))
        record.removedNodes.forEach(capture('removed'))
      }
    }).observe(card, { childList: true, subtree: true })
  }, cardInstanceId)
}

async function readCardStatusTimeline(page: Page): Promise<CardStatusTimelineEntry[]> {
  return await page.evaluate(() => {
    const timeline = (window as unknown as { __cardStatusTimeline?: CardStatusTimelineEntry[] })
      .__cardStatusTimeline
    return timeline ?? []
  })
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
  const chooseChip = targetCard.getByRole('button', { name: /^choose$/i })
  await expect(chooseChip).toBeVisible({ timeout: 10_000 })

  // Regression guard: a target card gets the `battle-target-*` class, and the stylesheet used to force every
  // direct child of such a card to `position: relative`. The status rail then fell into normal flow - full card
  // width and hanging below the card - so the badges looked shoved the moment a pick started.
  const targetCardBox = await targetCard.boundingBox()
  const targetRailBox = await targetCard.locator('[data-testid="card-status-badges"]').boundingBox()
  expect(targetCardBox).not.toBeNull()
  expect(targetRailBox).not.toBeNull()
  if (targetCardBox && targetRailBox) {
    const cardBottom = targetCardBox.y + targetCardBox.height
    expect(targetRailBox.y + targetRailBox.height).toBeLessThanOrEqual(cardBottom)
    expect(targetRailBox.width).toBeLessThan(targetCardBox.width / 2)
  }

  await chooseChip.click()
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



