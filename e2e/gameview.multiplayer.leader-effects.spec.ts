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

// `test-data/seed-profiles.json` gives the summon-requirements leader (T-001) a targeted
// "[Activate: Main] give a character in the character field +3 power" effect. That fixture is seeded in
// every environment - including CI, where the imported card catalog is replaced by placeholder catalog
// entries without effects - so this spec can rely on the effect existing.
const TARGETED_LEADER_EFFECT_SUFFIX = ':training-power'
const SUMMONABLE_CARD_DEFINITION_ID = 'T-100'

type ResolvedLeaderEffect = {
  player: PlayerAuth
  page: Page
  actionId: string
  actionLabel: string
  leaderInstanceId: string
  validTargetCount: number
}

async function resolveLeaderEffect(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<ResolvedLeaderEffect | null> {
  const [playerOneState, playerTwoState] = await Promise.all([
    fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
    fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
  ])

  const isPlayerOneActive = normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
  const player = isPlayerOneActive ? setup.playerOne : setup.playerTwo
  const state = isPlayerOneActive ? playerOneState : playerTwoState

  if (state.phase !== 'MainPhase' || state.pendingPrompt !== null) {
    return null
  }

  const leader = resolvePlayerState(state, player).leader
  const leaderEffectAction = (leader.availableActions ?? []).find((candidate) =>
    candidate.isEnabled && candidate.actionId.endsWith(TARGETED_LEADER_EFFECT_SUFFIX))

  if (!leaderEffectAction || !leader.instanceId) {
    return null
  }

  const validTargets = await getCardActionTargetsViaHub(
    setup.gameCode,
    player,
    leaderEffectAction.actionId,
    leader.instanceId,
  )

  if (validTargets.length === 0) {
    return null
  }

  return {
    player,
    page: isPlayerOneActive ? pages.playerOnePage : pages.playerTwoPage,
    actionId: leaderEffectAction.actionId,
    actionLabel: leaderEffectAction.label,
    leaderInstanceId: leader.instanceId,
    validTargetCount: validTargets.length,
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
    const setup = await setupMultiplayerGame(request, 'summon-requirements')
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')
      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      // The leader effect selects a character in a character field, so one has to reach the board.
      const summon = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', {
        cardDefinitionId: SUMMONABLE_CARD_DEFINITION_ID,
      })
      const summonCard = summon.actorPage.locator(`[data-testid="bottom-hand-card-${summon.cardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()
      await wait(1_200)

      let leaderEffect = await resolveLeaderEffect(request, setup, pages)
      for (let attempt = 0; attempt < 8 && leaderEffect === null; attempt += 1) {
        await passTurnViaUi(request, setup, pages)
        leaderEffect = await resolveLeaderEffect(request, setup, pages)
      }

      if (leaderEffect === null) {
        throw new Error(
          `No enabled leader effect '${TARGETED_LEADER_EFFECT_SUFFIX}' with selectable targets was available for the acting player.`,
        )
      }

      expect(leaderEffect.validTargetCount).toBeGreaterThan(0)

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
