import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  fetchGameState,
  getCardActionTargetsViaHub,
  normalizeUserId,
  openMultiplayerPages,
  resolveActorWithBottomHandAction,
  resolveAllMulliganPrompts,
  resolvePlayerState,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'
import type { MultiplayerPages, MultiplayerSetup, PlayerAuth } from './helpers/gameviewMultiplayerHelpers'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type ResolvedLeaderEffect = {
  player: PlayerAuth
  page: Page
  actionId: string
  actionLabel: string
  leaderInstanceId: string
  validTargetCount: number
}

type LeaderEffectLookup = {
  resolved: ResolvedLeaderEffect | null
  observedActionIds: string[]
}

// Leader effects that declare a target rule (for example "[Activate: Main] give a character in the
// character field +3 power") must open the board's target-selection mode instead of resolving
// immediately. Self-supplied effects ("draw 1 card, then place 1 card on top of your deck")
// legitimately expose no selectable targets, so the effect to exercise is the first one the server
// reports as having candidates.
async function resolveTargetedLeaderEffect(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<LeaderEffectLookup> {
  const [playerOneState, playerTwoState] = await Promise.all([
    fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
    fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
  ])

  const isPlayerOneActive = normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
  const player = isPlayerOneActive ? setup.playerOne : setup.playerTwo
  const state = isPlayerOneActive ? playerOneState : playerTwoState

  if (state.phase !== 'MainPhase' || state.pendingPrompt !== null) {
    return { resolved: null, observedActionIds: [] }
  }

  const leader = resolvePlayerState(state, player).leader
  const candidateActions = (leader.availableActions ?? []).filter((candidate) =>
    candidate.actionId.startsWith('leader-effect:')
    && candidate.isEnabled
    && candidate.label.trim().toLowerCase() !== 'recovery')

  if (!leader.instanceId || candidateActions.length === 0) {
    return { resolved: null, observedActionIds: candidateActions.map((candidate) => candidate.actionId) }
  }

  for (const candidate of candidateActions) {
    const validTargets = await getCardActionTargetsViaHub(
      setup.gameCode,
      player,
      candidate.actionId,
      leader.instanceId,
    )

    if (validTargets.length > 0) {
      return {
        resolved: {
          player,
          page: isPlayerOneActive ? pages.playerOnePage : pages.playerTwoPage,
          actionId: candidate.actionId,
          actionLabel: candidate.label,
          leaderInstanceId: leader.instanceId,
          validTargetCount: validTargets.length,
        },
        observedActionIds: candidateActions.map((entry) => entry.actionId),
      }
    }
  }

  return {
    resolved: null,
    observedActionIds: candidateActions.map((candidate) => candidate.actionId),
  }
}


async function passTurnViaUi(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<void> {
  const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
  const isPlayerOneActive = normalizeUserId(state.activePlayerId) === setup.playerOne.normalizedUserId
  const activePage = isPlayerOneActive ? pages.playerOnePage : pages.playerTwoPage

  await activePage.getByTestId('pass-turn-button').click()
  await expect.poll(async () => {
    const nextState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    return nextState.phase
  }, { timeout: 25_000 }).toBe('MainPhase')
  await wait(400)
}

test.describe('GameView multiplayer leader effects', () => {
  test.describe.configure({ timeout: 180_000 })

  // Regression guard: the store prunes stale interaction state on every state push. Leader effects are
  // published on the leader card (`leader-effect:{instanceId}:{effectKey}`) and never in the global
  // action list, so a prune that only scanned the hand/support/battlefield scopes deleted the freshly
  // opened targeting mode before the board could render it - the player saw no target prompt at all.
  test('leader effect targeting opens and survives the state push that follows the click', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')
      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      // The leader effect only reports as enabled once a character sits in a character field.
      const summon = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        actorUserId: startingOwner.userId,
      })
      const summonCard = summon.actorPage.locator(`[data-testid="bottom-hand-card-${summon.cardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()
      await wait(1_200)

      let lookup = await resolveTargetedLeaderEffect(request, setup, pages)
      for (let attempt = 0; attempt < 8 && lookup.resolved === null; attempt += 1) {
        await passTurnViaUi(request, setup, pages)
        lookup = await resolveTargetedLeaderEffect(request, setup, pages)
      }

      const leaderEffect = lookup.resolved
      if (leaderEffect === null) {
        throw new Error(
          'No enabled leader effect with selectable targets became available for the active player. '
          + `Observed enabled non-recovery leader effects: ${lookup.observedActionIds.join(', ') || '(none)'}`,
        )
      }

      const leaderCard = leaderEffect.page.locator('[data-zone="leader-card"][data-slot-side="bottom"]')
      await expect(leaderCard).toBeVisible({ timeout: 15_000 })
      await leaderCard.hover()

      const effectButton = leaderCard.getByRole('button', { name: leaderEffect.actionLabel, exact: true })
      await expect(effectButton).toBeEnabled({ timeout: 10_000 })
      await effectButton.click()

      const cancelChip = leaderEffect.page.getByTestId('cancel-target-mode-button')
      await expect(cancelChip).toBeVisible({ timeout: 10_000 })
      await expect(
        leaderEffect.page
          .locator('.battle-target-top, .battle-target-bottom, .battle-target-leader-top, .battle-target-leader-bottom')
          .first(),
      ).toBeVisible({ timeout: 10_000 })

      await cancelChip.click()
      await expect(cancelChip).toHaveCount(0, { timeout: 10_000 })
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
