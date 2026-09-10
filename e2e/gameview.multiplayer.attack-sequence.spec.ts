import { expect, test } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  declarePassInActionStepViaHub,
  executeBattleActionViaHub,
  fetchGameState,
  openMultiplayerPages,
  resolveActorWithBottomBattleAction,
  resolveActorWithBottomHandAction,
  resolveAllMulliganPrompts,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function passThroughActionStep(
  request: import('@playwright/test').APIRequestContext,
  setup: Awaited<ReturnType<typeof setupMultiplayerGame>>,
): Promise<void> {
  for (let step = 0; step < 8; step += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    if (playerOneState.phase !== 'ActionStep') {
      return
    }

    const playerOneCanPass = playerOneState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    const playerTwoCanPass = playerTwoState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)

    if (playerOneCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerOne)
    } else if (playerTwoCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerTwo)
    } else {
      return
    }

    await wait(300)
  }
}

async function waitForMainPhase(
  request: import('@playwright/test').APIRequestContext,
  setup: Awaited<ReturnType<typeof setupMultiplayerGame>>,
): Promise<void> {
  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    return state.phase
  }, { timeout: 25_000 }).toBe('MainPhase')
}

function isPlayerOneActive(
  state: { activePlayerId: string },
  setup: Awaited<ReturnType<typeof setupMultiplayerGame>>,
): boolean {
  const activeUserId = state.activePlayerId.replace(/-/g, '').toLowerCase()
  return activeUserId === setup.playerOne.normalizedUserId.replace(/-/g, '').toLowerCase()
    || activeUserId === setup.playerOne.userId.replace(/-/g, '').toLowerCase()
}

// The regression guard: after each attack the acting player must still be able to take a
// main-phase action. A stalled client (or stalled auto-advance) leaves the board without
// any legal action until the page is refreshed.
async function expectActivePlayerCanAct(
  request: import('@playwright/test').APIRequestContext,
  setup: Awaited<ReturnType<typeof setupMultiplayerGame>>,
): Promise<void> {
  await expect.poll(async () => {
    const playerOneState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    const activeState = isPlayerOneActive(playerOneState, setup)
      ? playerOneState
      : await fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken)

    return activeState.availableActions.some((action) => action.actionId === 'turn-end' && action.isEnabled)
  }, { timeout: 25_000 }).toBe(true)
}

test.describe('GameView multiplayer attack sequence', () => {
  test.describe.configure({ timeout: 180_000 })

  test('two attacks across a turn change resolve and keep both boards interactive', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      const otherPlayer = startingOwner.userId === setup.playerOne.userId ? setup.playerTwo : setup.playerOne

      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')
      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const summonFor = async (actorUserId: string): Promise<string> => {
        const actor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon', { actorUserId })
        const card = actor.actorPage.locator(`[data-testid="bottom-hand-card-${actor.cardInstanceId}"]`)
        await card.hover()
        await card.getByRole('button', { name: /^summon$/i }).click()
        await wait(1_200)
        return actor.cardInstanceId
      }

      const endTurnViaUi = async (): Promise<void> => {
        const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
        const activeUserId = state.activePlayerId.toLowerCase()
        const isPlayerOneActive = activeUserId === setup.playerOne.userId.toLowerCase()
          || activeUserId === setup.playerOne.normalizedUserId.toLowerCase()
        const activePage = isPlayerOneActive ? pages.playerOnePage : pages.playerTwoPage

        await activePage.getByTestId('pass-turn-button').click()
        await expect.poll(async () => {
          const nextState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
          return `${nextState.phase}:${nextState.activePlayerId.toLowerCase() !== state.activePlayerId.toLowerCase()}`
        }, { timeout: 25_000 }).toBe('MainPhase:true')
      }

      // Both attackers are summoned one turn ahead so they are not summon-sick when attacking.
      const firstAttacker = await summonFor(startingOwner.userId)
      await endTurnViaUi()
      const secondAttacker = await summonFor(otherPlayer.userId)
      await endTurnViaUi()

      // Attack #1 by the starting owner.
      const firstAttack = await resolveActorWithBottomBattleAction(request, setup, pages)
      expect(firstAttack.cardInstanceId).toBe(firstAttacker)
      await executeBattleActionViaHub(setup.gameCode, firstAttack.actor, firstAttack.actionId, firstAttack.cardInstanceId)
      await passThroughActionStep(request, setup)
      await waitForMainPhase(request, setup)
      await expectActivePlayerCanAct(request, setup)

      await endTurnViaUi()

      // Attack #2 by the other player on their next turn - the reported failure window.
      const secondAttack = await resolveActorWithBottomBattleAction(request, setup, pages)
      expect(secondAttack.cardInstanceId).toBe(secondAttacker)
      await executeBattleActionViaHub(setup.gameCode, secondAttack.actor, secondAttack.actionId, secondAttack.cardInstanceId)
      await passThroughActionStep(request, setup)
      await waitForMainPhase(request, setup)
      await expectActivePlayerCanAct(request, setup)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
