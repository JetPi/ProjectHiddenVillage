import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import type { MultiplayerPages, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  countCardFlightCopies,
  fetchGameState,
  getCardFlightCount,
  getCardFlightLeakReport,
  installCardFlightCounter,
  installCardFlightLeakObserver,
  openMultiplayerPages,
  resolveAllMulliganPrompts,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

/**
 * Board-animation hygiene.
 *
 * The overlay flight engine exists to make one promise: a flight draws a copy on the flight layer and removes
 * that copy exactly once. The two specs here pin the two halves of it:
 *
 *  - the layer drains (no copy outlives its flight - the "ghost" regression), and
 *  - reduced motion skips the copy entirely while the phase-presentation acknowledgement still resolves
 *    (the protocol half: a skipped flight must settle, never leave the engine parked).
 */

function isPlayerOneActive(state: { activePlayerId: string }, setup: MultiplayerSetup): boolean {
  const activeUserId = state.activePlayerId.replace(/-/g, '').toLowerCase()
  return activeUserId === setup.playerOne.normalizedUserId.replace(/-/g, '').toLowerCase()
    || activeUserId === setup.playerOne.userId.replace(/-/g, '').toLowerCase()
}

/**
 * Drives the opening (starting player + mulligan) and waits for the engine-driven phase walk to settle into a
 * MainPhase. Reaching it through the chain is itself the acknowledgement proof: the engine parks on every
 * transition until every connected client acknowledges it.
 */
async function playOpeningIntoMainPhase(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<void> {
  const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
  const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo

  await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')
  await advanceToMulliganPromptIfNeeded(request, setup)
  await resolveAllMulliganPrompts(request, setup, 'noMulligan')

  await expect.poll(async () => {
    const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    return state.phase
  }, { timeout: 45_000 }).toBe('MainPhase')
}

function bothPages(pages: MultiplayerPages): Page[] {
  return [pages.playerOnePage, pages.playerTwoPage]
}

test.describe('GameView multiplayer board animation hygiene', () => {
  test.describe.configure({ timeout: 180_000 })

  test('card flights drain to an empty layer and never leave a copy behind', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      // Installed before the opening settles, so the first turn's draws are observed too. The counters are
      // cumulative, so it does not matter which of the two clients draws first.
      for (const page of bothPages(pages)) {
        await installCardFlightCounter(page)
        await installCardFlightLeakObserver(page)
      }

      await playOpeningIntoMainPhase(request, setup)

      // Draws fly deck -> hand as overlay copies, so the opening has already produced at least one flight.
      // Without this the drain assertion below could pass on a board that simply never animated.
      await expect.poll(async () => {
        let total = 0
        for (const page of bothPages(pages)) {
          total += await getCardFlightCount(page)
        }
        return total
      }, { timeout: 30_000 }).toBeGreaterThan(0)

      // The layer drains: no copy survives its flight.
      for (const page of bothPages(pages)) {
        await expect.poll(async () => await countCardFlightCopies(page), { timeout: 30_000 }).toBe(0)
      }

      // And nothing was orphaned along the way. A copy still attached long after the longest flight would be
      // the old engine's ghost, and the observer reports it whether or not the layer happens to look empty.
      for (const page of bothPages(pages)) {
        const report = await getCardFlightLeakReport(page)
        expect(report.seen, 'the opening should have flown at least one copy').toBeGreaterThan(0)
        expect(report.leaks, `orphaned flight copies: ${JSON.stringify(report)}`).toBe(0)
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('reduced motion skips every flight copy while the engine still walks its phases', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      for (const page of bothPages(pages)) {
        // Preferred over the config's `no-preference`: the policy is read when a flight starts, so emulating
        // here (before the opening deal, which is where the draws happen) covers every flight in this run.
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await installCardFlightCounter(page)
      }

      await playOpeningIntoMainPhase(request, setup)

      // The walk is the acknowledgement proof: the engine parks on each transition until every connected
      // client acknowledges it, so a flight that registered but never played would leave it parked forever.
      const settledState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
      expect(
        (settledState as { pendingPresentation?: unknown }).pendingPresentation ?? null,
        'A skipped flight must still let the presentation acknowledgement resolve.',
      ).toBeNull()

      for (const page of bothPages(pages)) {
        expect(await getCardFlightCount(page)).toBe(0)
        expect(await countCardFlightCopies(page)).toBe(0)
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
