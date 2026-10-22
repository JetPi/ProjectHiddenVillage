import { expect, test } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  resolveAllMulliganPrompts,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
} from './helpers/gameviewMultiplayerHelpers'
import type { APIRequestContext, Page } from '@playwright/test'
import type { MultiplayerPages, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'
import {
  closeMultiplayerPages,
  countHeldArrivalCardElements,
  countTravelingCardElements,
  fetchGameState,
  getCardFlightCount,
  getCardFlightRecords,
  getHandArrivalFlickerReport,
  installCardFlightCounter,
  installHandArrivalFlickerObserver,
  openMultiplayerPages,
  resolveActorWithBottomHandAction,
  resolvePlayerState,
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

const IDENTITY_SELECTOR = '[data-hand-instance-id], [data-card-instance-id], [data-departing-instance-id]'

type InstanceCensusReport = {
  framesSampled: number
  errors: number
  duplicateFrames: number
  orphanFrames: number
  finalDuplicates: string[]
  duplicates: Array<{ at: number; instanceId: string; elements: string[] }>
  orphans: Array<{ at: number; instanceId: string; flying: string; other: string }>
}

/**
 * Watches the whole document, once per frame, for the one invariant the flight engine cannot express by itself:
 * a card instance is either in a hand row or in a zone, never in both at once.
 *
 * It is deliberately independent of any single animation effect. The hand row used to hold a removed card for
 * one extra render (`AnimatePresence` keeps a leaving child for a commit even when it has no exit animation), so
 * the played card existed twice while its arrival flight started - invisible when the flight hid the
 * destination, visible as a second card on slower frames.
 */
async function installInstanceIdentityCensus(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const state = window as unknown as Record<string, unknown>
    if (state.__phvInstanceCensusInstalled === true) {
      return
    }

    state.__phvInstanceCensusInstalled = true
    state.__phvInstanceCensusFrames = 0
    state.__phvInstanceCensusErrors = 0
    state.__phvInstanceCensusDuplicateFrames = 0
    state.__phvInstanceCensusOrphanFrames = 0
    state.__phvInstanceCensusDuplicates = []
    state.__phvInstanceCensusOrphans = []

    const readInstanceId = (element: Element): string => (
      element.getAttribute('data-hand-instance-id')
      ?? element.getAttribute('data-card-instance-id')
      ?? element.getAttribute('data-departing-instance-id')
      ?? ''
    )

    const describe = (element: HTMLElement): string => {
      const rect = element.getBoundingClientRect()
      const zone = element.getAttribute('data-zone') ?? ''
      const row = element.closest('[data-testid="bottom-hand-row"]')
        ? 'bottom-hand-row'
        : element.closest('[data-testid="top-hand-row"]') ? 'top-hand-row' : ''
      const where = zone || row || 'unknown'
      const kind = element.hasAttribute('data-hand-instance-id')
        ? 'hand'
        : element.hasAttribute('data-departing-instance-id') ? 'departing' : 'board'
      return `${kind}:${where}@${Math.round(rect.left)},${Math.round(rect.top)}`
    }

    const isPainted = (element: HTMLElement): boolean => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const parentOpacity = element.parentElement ? Number(getComputedStyle(element.parentElement).opacity) : 1
      return rect.width > 0
        && rect.height > 0
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && Number(style.opacity) > 0.02
        && parentOpacity > 0.02
    }

    const tick = (): void => {
      const frames = (state.__phvInstanceCensusFrames as number) + 1
      state.__phvInstanceCensusFrames = frames
      if (frames > 6_000) {
        return
      }

      try {
        const byInstance = new Map<string, HTMLElement[]>()
        document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
          const instanceId = readInstanceId(element)
          if (!instanceId) {
            return
          }

          const list = byInstance.get(instanceId) ?? []
          list.push(element)
          byInstance.set(instanceId, list)
        })

        const at = Math.round(performance.now())

        for (const [instanceId, elements] of byInstance) {
          if (elements.length > 1) {
            state.__phvInstanceCensusDuplicateFrames = (state.__phvInstanceCensusDuplicateFrames as number) + 1
            const duplicates = state.__phvInstanceCensusDuplicates as unknown[]
            if (duplicates.length < 12) {
              duplicates.push({ at, instanceId, elements: elements.map(describe) })
            }
          }

          // A card that is in the air is the only visual allowed for its own instance.
          const flying = elements.filter((element) => element.getAttribute('data-card-traveling') === 'true')
          if (flying.length === 0) {
            continue
          }

          const alongside = elements.filter((element) => !flying.includes(element) && isPainted(element))
          if (alongside.length > 0) {
            state.__phvInstanceCensusOrphanFrames = (state.__phvInstanceCensusOrphanFrames as number) + 1
            const orphans = state.__phvInstanceCensusOrphans as unknown[]
            if (orphans.length < 12) {
              orphans.push({
                at,
                instanceId,
                flying: flying.map(describe).join(' | '),
                other: alongside.map(describe).join(' | '),
              })
            }
          }
        }
      } catch {
        // An exception in a frame callback would stop the loop and make every count read zero, so the census
        // counts its own failures: green with a dead sampler is the one outcome that must never look green.
        state.__phvInstanceCensusErrors = ((state.__phvInstanceCensusErrors as number) ?? 0) + 1
      }

      window.requestAnimationFrame(tick)
    }

    window.requestAnimationFrame(tick)
  }, IDENTITY_SELECTOR)
}

async function readInstanceCensus(page: Page): Promise<InstanceCensusReport> {
  return await page.evaluate((selector) => {
    const state = window as unknown as Record<string, unknown>
    const readInstanceId = (element: Element): string => (
      element.getAttribute('data-hand-instance-id')
      ?? element.getAttribute('data-card-instance-id')
      ?? ''
    )
    const counts = new Map<string, number>()
    document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
      const instanceId = readInstanceId(element)
      if (!instanceId) {
        return
      }

      counts.set(instanceId, (counts.get(instanceId) ?? 0) + 1)
    })

    return {
      framesSampled: (state.__phvInstanceCensusFrames as number) ?? 0,
      errors: (state.__phvInstanceCensusErrors as number) ?? 0,
      duplicateFrames: (state.__phvInstanceCensusDuplicateFrames as number) ?? 0,
      orphanFrames: (state.__phvInstanceCensusOrphanFrames as number) ?? 0,
      duplicates: (state.__phvInstanceCensusDuplicates as InstanceCensusReport['duplicates']) ?? [],
      orphans: (state.__phvInstanceCensusOrphans as InstanceCensusReport['orphans']) ?? [],
      finalDuplicates: [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([instanceId]) => instanceId),
    }
  }, IDENTITY_SELECTOR)
}

async function expectOneVisualPerInstance(pages: MultiplayerPages): Promise<void> {
  for (const page of bothPages(pages)) {
    await expect.poll(async () => (await readInstanceCensus(page)).framesSampled, {
      timeout: 10_000,
    }).toBeGreaterThan(0)

    const report = await readInstanceCensus(page)
    expect(report.errors, `the instance census swallowed an exception: ${JSON.stringify(report)}`).toBe(0)
    expect(
      report.duplicateFrames,
      `a card instance was rendered twice while it moved: ${JSON.stringify(report.duplicates)}`,
    ).toBe(0)
    expect(
      report.orphanFrames,
      `a card was painted while its own flight was in the air: ${JSON.stringify(report.orphans)}`,
    ).toBe(0)
    expect(
      report.finalDuplicates,
      'a settled board must not render one card instance twice',
    ).toEqual([])
  }
}

function isPlayerOneActive(state: { activePlayerId: string }, setup: MultiplayerSetup): boolean {
  const activeUserId = state.activePlayerId.replace(/-/g, '').toLowerCase()
  return activeUserId === setup.playerOne.normalizedUserId.replace(/-/g, '').toLowerCase()
    || activeUserId === setup.playerOne.userId.replace(/-/g, '').toLowerCase()
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

      // Nothing is duplicated either - across the whole document, not only inside the hand. A card instance
      // belongs to one hand row or one zone; finding the same id twice is the duplicate the flight must never
      // leave behind.
      for (const page of bothPages(pages)) {
        const duplicatedInstanceIds = await page.evaluate(() => {
          const readInstanceId = (element: Element): string => (
            element.getAttribute('data-hand-instance-id')
            ?? element.getAttribute('data-card-instance-id')
            ?? ''
          )
          const seen = new Set<string>()
          const duplicates: string[] = []
          document.querySelectorAll<HTMLElement>('[data-hand-instance-id], [data-card-instance-id]').forEach((element) => {
            const instanceId = readInstanceId(element)
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

        expect(duplicatedInstanceIds, 'a card instance must never render twice').toEqual([])
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('a dealt hand is revealed by its own flight, never by a second animation', async ({ browser, request }) => {
    // Opted out of the warm start on purpose: the opening deal *is* the animation under test, so the pages have
    // to be watching before it happens. Warming the game would deal the hand before any observer exists.
    const setup = await setupMultiplayerGame(request, 'default', {}, { warmStart: false })
    const pages = await openMultiplayerPages(browser, setup)

    try {
      // Installed before the opening deal (which the engine runs when the starting player is chosen), so the
      // whole batch is observed from the first frame each card exists.
      for (const page of bothPages(pages)) {
        await installHandArrivalFlickerObserver(page)
        await installCardFlightCounter(page)
      }

      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')
      for (const page of bothPages(pages)) {
        // A hold has to have happened at all, otherwise the two counts below would be vacuously true.
        await expect.poll(async () => (await getHandArrivalFlickerReport(page)).heldCards, {
          timeout: 30_000,
        }).toBeGreaterThan(0)

        const flickerReport = await getHandArrivalFlickerReport(page)
        expect(
          flickerReport.paintedWhileHeld,
          `a card was painted at its resting spot while held for its flight: ${JSON.stringify(flickerReport)}`,
        ).toBe(0)
        expect(
          flickerReport.doubleAnimated,
          `a flying card also ran a Motion animation: ${JSON.stringify(flickerReport)}`,
        ).toBe(0)
        // An arrival is a move, not a resize: the card keeps its own size for the whole flight.
        expect(
          flickerReport.resizedWhileArriving,
          `a card was resized in the air: ${JSON.stringify(flickerReport)}`,
        ).toBe(0)

        // The sampler's own bookkeeping first: an exception inside its frame callback stops the loop silently and
        // every count above then reads zero, so green would mean nothing at all.
        expect(
          flickerReport.framesSampled,
          `the arrival sampler never ran: ${JSON.stringify(flickerReport)}`,
        ).toBeGreaterThan(0)
        expect(
          flickerReport.observerErrors,
          `the arrival sampler swallowed an exception: ${JSON.stringify(flickerReport)}`,
        ).toBe(0)

        // A dealt card is drawn where it is at every frame of its flight - on top of the hand row and the board it
        // crosses, not under them (a board card's own `z-index` is local to its half, which is what the
        // `[data-board-half][data-flight-owner='true']` promotion in `index.css` exists for).
        expect(
          flickerReport.clippedWhileFlying,
          `a card was covered while it flew: ${JSON.stringify(flickerReport)}`,
        ).toBe(0)
        // And none is left laid out in the hand but invisible.
        expect(
          flickerReport.unpaintedHandCards,
          `a hand card was left unpainted: ${JSON.stringify(flickerReport)}`,
        ).toBe(0)

        // And every hold is released once the board settles: a held card left behind would be invisible.
        await expect.poll(async () => await countHeldArrivalCardElements(page), { timeout: 30_000 }).toBe(0)
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('reduced motion skips every flight while the engine still walks its phases', async ({ browser, request }) => {
    // Also opted out: the subject is the *opening phase walk*, so the engine has to walk those transitions while
    // the pages are watching. A warm-started game is already parked in the MainPhase.
    const setup = await setupMultiplayerGame(request, 'default', {}, { warmStart: false })
    const pages = await openMultiplayerPages(browser, setup)

    try {
      for (const page of bothPages(pages)) {
        // Preferred over the config's `no-preference`: the policy is read when a flight starts, so emulating
        // here (before the opening deal, which is where the draws happen) covers every flight in this run.
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await installCardFlightCounter(page)
      }

      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
        return state.phase
      }, { timeout: 45_000 }).toBe('MainPhase')
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
        // A skipped flight must still release its card: a hold left behind would be an invisible card.
        expect(await countHeldArrivalCardElements(page)).toBe(0)
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('a set support is never painted in the hand and in its slot at the same time', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      for (const page of bothPages(pages)) {
        await installCardFlightCounter(page)
        await installInstanceIdentityCensus(page)
      }

      const supportActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Set Support')
      const supportCard = supportActor.actorPage.locator(`[data-testid="bottom-hand-card-${supportActor.cardInstanceId}"]`)
      await supportCard.hover()
      await supportCard.getByRole('button', { name: /^set support$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, supportActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, supportActor.actor)
        return {
          inSupportZone: actorState.supportZone.some((card) => card.instanceId === supportActor.cardInstanceId),
          stillInHand: actorState.hand.some((card) => card.instanceId === supportActor.cardInstanceId),
        }
      }, { timeout: 15_000 }).toEqual({ inSupportZone: true, stillInHand: false })

      await expect.poll(async () => {
        const records = await getCardFlightRecords(supportActor.actorPage)
        return records.some((record) => record.instanceId === supportActor.cardInstanceId)
      }, { timeout: 10_000 }).toBe(true)
      await expect.poll(async () => await countTravelingCardElements(supportActor.actorPage), { timeout: 10_000 }).toBe(0)

      await expectOneVisualPerInstance(pages)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('a summoned card is never painted in the hand and on the field at the same time', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      for (const page of bothPages(pages)) {
        await installCardFlightCounter(page)
        await installInstanceIdentityCensus(page)
      }

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
      const summonCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return {
          onField: actorState.characterField.some((card) => card.instanceId === summonActor.cardInstanceId),
          stillInHand: actorState.hand.some((card) => card.instanceId === summonActor.cardInstanceId),
        }
      }, { timeout: 15_000 }).toEqual({ onField: true, stillInHand: false })

      await expect.poll(async () => {
        const records = await getCardFlightRecords(summonActor.actorPage)
        return records.some((record) => record.instanceId === summonActor.cardInstanceId)
      }, { timeout: 10_000 }).toBe(true)
      await expect.poll(async () => await countTravelingCardElements(summonActor.actorPage), { timeout: 10_000 }).toBe(0)

      await expectOneVisualPerInstance(pages)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
