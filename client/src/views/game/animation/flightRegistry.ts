/**
 * Ownership registry for in-flight board animations.
 *
 * The legacy engine starts WAAPI animations from several effects and, for card exits, appends throwaway
 * ghost nodes to `document.body`. Nothing owned those animations as a set, so an interrupted flight could
 * orphan its ghost (the "ghost left behind") and two flights could write the same element's `transform`
 * (the stale-restore corruption). This registry is the single owner:
 *
 *  - one flight per key (the card's instance id), so a new flight takes over an old one instead of stacking;
 *  - every ghost is tracked and removed exactly once;
 *  - a global teardown cancels everything while the tab is hidden, so a backgrounded board cannot leave
 *    ghosts behind for the next paint.
 *
 * React-unmount cleanup is the caller's job (`cancelAllFlights`), because this module cannot know when a
 * board is torn down; the visibility teardown is installed here so it can never be forgotten.
 */

type IActiveFlight = {
  element: HTMLElement
  animation: Animation
  ghost: HTMLElement | null
}

const activeFlightsByKey = new Map<string, IActiveFlight>()
const activeGhosts = new Set<HTMLElement>()
let isTeardownInstalled = false
let anonymousFlightSequence = 0

/** A stable key for an animated element: the card it represents, or a unique anonymous id. */
function resolveElementFlightKey(element: HTMLElement): string {
  return element.dataset.cardInstanceId
    ?? element.dataset.handInstanceId
    ?? `anonymous-flight-${anonymousFlightSequence++}`
}

function removeGhost(ghost: HTMLElement): void {
  activeGhosts.delete(ghost)
  ghost.remove()
}

/**
 * Takes ownership of a flight. Any flight already registered under the same key is cancelled first, so a
 * card never has two animations writing its transform at once.
 */
function registerFlight({
  key,
  element,
  animation,
  ghost = null,
}: {
  key: string
  element: HTMLElement
  animation: Animation
  ghost?: HTMLElement | null
}): void {
  const previousFlight = activeFlightsByKey.get(key)
  if (previousFlight) {
    // Detach before cancelling: the previous cleanup must not unregister the flight we are about to add.
    activeFlightsByKey.delete(key)
    previousFlight.animation.cancel()
    if (previousFlight.ghost) {
      removeGhost(previousFlight.ghost)
    }
  }

  if (ghost) {
    activeGhosts.add(ghost)
  }

  activeFlightsByKey.set(key, { element, animation, ghost })
  ensureVisibilityTeardown()
}

/** Releases a flight. Only the flight that still owns its key may release it. */
function unregisterFlight(key: string, animation: Animation): void {
  const flight = activeFlightsByKey.get(key)
  if (!flight || flight.animation !== animation) {
    return
  }

  activeFlightsByKey.delete(key)
  if (flight.ghost) {
    removeGhost(flight.ghost)
  }
}

/**
 * Cancels whichever flight currently owns `element` and lets it run its cleanup, so the caller can capture
 * inline styles from a clean baseline instead of a mid-animation one.
 */
function cancelFlightsForElement(element: HTMLElement): void {
  for (const key of [...activeFlightsByKey.keys()]) {
    const flight = activeFlightsByKey.get(key)
    if (flight?.element === element) {
      flight.animation.cancel()
    }
  }
}

/** Cancels every flight and removes every ghost; each flight's own cleanup runs as its animation cancels. */
function cancelAllFlights(): void {
  for (const key of [...activeFlightsByKey.keys()]) {
    activeFlightsByKey.get(key)?.animation.cancel()
  }

  // A cleanup removes its ghost, but sweep whatever is left so nothing can outlive the teardown.
  for (const ghost of [...activeGhosts]) {
    removeGhost(ghost)
  }
}

function ensureVisibilityTeardown(): void {
  if (isTeardownInstalled || typeof document === 'undefined') {
    return
  }

  isTeardownInstalled = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      cancelAllFlights()
    }
  })
}

export {
  resolveElementFlightKey,
  registerFlight,
  unregisterFlight,
  cancelFlightsForElement,
  cancelAllFlights,
}
