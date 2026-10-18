import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import type { MultiplayerPages, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'
import {
  closeMultiplayerPages,
  fetchGameState,
  getPhaseRowSamples,
  installPhaseRowSampler,
  markPhaseRowSampleTime,
  openMultiplayerPages,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

// The engine's system action. It must never be drawn as a chip: the server does not even publish it for the
// games whose phases the automation drives, and the phase row keeps the chips of the last interactive phase
// while the engine walks those phases - so a "held" row is what the assertions below look for.
const ADVANCE_PHASE_CHIP_TEXT = 'Advance Phase'
// The one interactive chip the active player has in their MainPhase (`endPhase` -> `turn-end`).
const END_TURN_CHIP_TEXT = 'End Turn'
// The phase banner's text while it is this client's turn, in the MainPhase *and* in every automatic phase
// that follows it (EndStep) until the turn actually changes hands.
const OWN_TURN_PHASE_TEXT = 'Your turn'
// A full turn hand-over (the TurnEnd presentation, the new turn's Draw, and a Ready only when something
// actually stood up) has to land inside this budget. It is generous for CI variance but tight enough to catch
// a return to the old 400/700/700 ms per-kind floors, which summed to a couple of seconds of dead time.
const HANDOVER_BUDGET_MS = 2_500

function isPlayerOneActive(
  state: { activePlayerId: string },
  setup: MultiplayerSetup,
): boolean {
  const activeUserId = state.activePlayerId.replace(/-/g, '').toLowerCase()
  return activeUserId === setup.playerOne.normalizedUserId.replace(/-/g, '').toLowerCase()
    || activeUserId === setup.playerOne.userId.replace(/-/g, '').toLowerCase()
}

/** The page of the player whose turn it is once the opening deal has settled into a MainPhase. */
async function waitForActiveMainPhase(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<Page> {
  let activePage: Page = pages.playerOnePage
  const observedPhases: string[] = []

  try {
    await expect.poll(async () => {
      const playerOneState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
      observedPhases.push(playerOneState.phase)
      if (playerOneState.phase !== 'MainPhase') {
        return 'waiting'
      }

      activePage = isPlayerOneActive(playerOneState, setup) ? pages.playerOnePage : pages.playerTwoPage
      return 'ready'
    }, { timeout: 30_000 }).toBe('ready')
  } catch (error) {
    const distinctPhases = Array.from(new Set(observedPhases)).join(' -> ')
    const oneSamples = await getPhaseRowSamples(pages.playerOnePage)
    const twoSamples = await getPhaseRowSamples(pages.playerTwoPage)
    const describeSamples = (samples: typeof oneSamples) => samples
      .slice(-4)
      .map((sample) => `${sample.phaseText}|${sample.chipTexts.join('+')}`)
      .join(' ; ')
    throw new Error(
      `The client never settled into a MainPhase. Server phases observed: ${distinctPhases}.`
      + ` P1 samples (${oneSamples.length}): ${describeSamples(oneSamples)}.`
      + ` P2 samples (${twoSamples.length}): ${describeSamples(twoSamples)}. ${error}`,
    )
  }

  return activePage
}

test.describe('GameView multiplayer phase transitions', () => {
  test.describe.configure({ timeout: 180_000 })

  test('an automatic transition holds the last action chips and never shows Advance Phase', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      // Installed before the opening deal settles, so the sampler already covers the first turn's automatic
      // chain (StartOfMainPhase -> DrawPhase -> RefreshPhase -> MainPhase) and every sample of the run below.
      await installPhaseRowSampler(pages.playerOnePage)
      await installPhaseRowSampler(pages.playerTwoPage)

      const activePage = await waitForActiveMainPhase(request, setup, pages)

      // Reaching the MainPhase through the engine-driven chain is itself the proof of the handshake: the engine
      // parks on each transition until every connected client acknowledges it, so a stalled board would never get
      // here. The receipt must also be gone once the walk is over - a board left "mid-transition" would keep the
      // phase row frozen (and the server would keep rejecting every action).
      const settledState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
      expect(
        (settledState as { pendingPresentation?: unknown }).pendingPresentation ?? null,
        'The engine is not left parked on a presentation after the chain settles.',
      ).toBeNull()

      const endTurnChip = activePage.getByRole('button', { name: END_TURN_CHIP_TEXT })
      await expect(endTurnChip).toBeEnabled({ timeout: 30_000 })

      const activeUserIdBefore = (await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken))
        .activePlayerId.replace(/-/g, '').toLowerCase()
      const markTime = await markPhaseRowSampleTime(activePage)
      const handoverStartedAtMs = Date.now()

      // Ending the turn is the transition under test: the MainPhase chips ("End Turn") must survive it while
      // the engine walks EndStep and hands the turn over.
      await endTurnChip.click()

      await expect.poll(async () => {
        const nextState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
        return nextState.activePlayerId.replace(/-/g, '').toLowerCase()
      }, { timeout: 30_000 }).not.toBe(activeUserIdBefore)

      const samples = await getPhaseRowSamples(activePage)
      expect(samples.length).toBeGreaterThan(0)

      // The regression: the system action is never drawn, in any frame of the whole observed run - neither on
      // the automatic hops of the opening chain nor during the turn hand-over.
      expect(samples.filter((sample) => sample.chipTexts.includes(ADVANCE_PHASE_CHIP_TEXT))).toEqual([])

      const transitionSamples = samples.filter((sample) => sample.at >= markTime)
      expect(transitionSamples.length).toBeGreaterThan(0)

      // The chips held. Every frame still showing this client's turn - which includes the EndStep window that
      // used to flash "Advance Phase" - kept exactly the chips the row had before the turn was ended.
      const ownTurnSamples = transitionSamples.filter((sample) => sample.phaseText === OWN_TURN_PHASE_TEXT)
      expect(ownTurnSamples.length).toBeGreaterThan(0)

      // Every painted own-turn chip set must be exactly the held "End Turn". A single frame may momentarily
      // report no buttons while React commits the held list; anything more than one such frame is the strip
      // collapsing, which is the flicker this pins.
      const ownTurnChipSets = Array.from(new Set(
        ownTurnSamples.filter((sample) => sample.chipTexts.length > 0).map((sample) => sample.chipTexts.join('|')),
      ))
      expect(ownTurnChipSets).toEqual([END_TURN_CHIP_TEXT])
      const emptyOwnTurnFrameCount = ownTurnSamples.filter((sample) => sample.chipTexts.length === 0).length
      expect(emptyOwnTurnFrameCount).toBeLessThanOrEqual(1)

      // The turn did move on, so the held frames above really are the transition and not a stalled row.
      const opponentTurnSamples = transitionSamples.filter((sample) => sample.phaseText !== OWN_TURN_PHASE_TEXT)
      expect(opponentTurnSamples.length).toBeGreaterThan(0)

      // And the hand-over is snappy: wait until the new turn actually reaches its MainPhase (so the whole
      // TurnEnd -> Draw -> Ready chain has settled) and assert it landed inside the budget.
      await expect.poll(async () => {
        const settledNextState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
        return settledNextState.phase
      }, { timeout: 30_000 }).toBe('MainPhase')
      expect(Date.now() - handoverStartedAtMs).toBeLessThan(HANDOVER_BUDGET_MS)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
