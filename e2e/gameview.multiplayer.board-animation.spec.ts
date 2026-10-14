import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import type { MultiplayerPages, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  countTravelingCardElements,
  fetchGameState,
  getCardFlightCount,
  installCardFlightCounter,
  openMultiplayerPages,
  resolveAllMulliganPrompts,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

/**
 * Board-animation hygiene.
 *
 * The flight engine makes one promise: the card that travels is the card itself, and the flight cleans up after
 * itself exactly once. The two specs here pin the two halves of it:
 *
 *  - no card is left mid-flight, and none renders twice (the card that flies is the card that lands - a second
 *    element for the same card, or a marker left behind on a live card, is the regression), and
 *  - reduced motion skips the flight entirely while the phase-presentation acknowledgement still resolves
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

  test('a moving card travels as itself and never leaves a copy or a duplicate behind', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      // Installed before the opening settles, so the first turn's draws are observed too. The counters are
      // cumulative, so it does not matter which of the two clients draws first.
      for (const page of bothPages(pages)) {
        await installCardFlightCounter(page)
      }

      await playOpeningIntoMainPhase(request, setup)

      // A draw is an entity-based flight: the arriving hand card itself travels from the deck. The counter sees
      // whichever marker moved, so this proves the opening animated rather than teleported.
      await expect.poll(async () => {
        let total = 0
        for (const page of bothPages(pages)) {
          total += await getCardFlightCount(page)
        }
        return total
      }, { timeout: 30_000 }).toBeGreaterThan(0)

      // Every flight cleaned up after itself: nothing is still marked as travelling once the board has settled.
      for (const page of bothPages(pages)) {
        await expect.poll(async () => await countTravelingCardElements(page), { timeout: 30_000 }).toBe(0)
      }

      // Nothing is duplicated either - the card that flew is the card that landed, not a second element beside it.
      for (const page of bothPages(pages)) {
        const duplicatedInstanceIds = await page.evaluate(() => {
          const seen = new Set<string>()
          const duplicates: string[] = []
          document.querySelectorAll<HTMLElement>('[data-hand-instance-id]').forEach((element) => {
            const instanceId = element.getAttribute('data-hand-instance-id')
            if (!instanceId) {
              return
            }

            if (seen.has(instanceId)) {
              duplicates.push(instanceId)
              return
            }

            seen.add(instanceId)
          })

          return duplicates
        })

        expect(duplicatedInstanceIds, 'a hand card must never render twice').toEqual([])
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
        expect(await countTravelingCardElements(page)).toBe(0)
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
