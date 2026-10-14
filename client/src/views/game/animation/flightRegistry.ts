/**
 * Ownership registry for in-flight board animations.
 *
 * The legacy engine started WAAPI animations from several effects and appended throwaway ghost nodes to
 * `document.body`. Nothing owned those animations as a set, so an interrupted flight could orphan its node (the
 * "ghost left behind") and two flights could write the same element's `transform` (the stale-restore
 * corruption). This registry is the single owner:
 *
 *  - one flight per key (the card's instance id), so a new flight takes over an old one instead of stacking;
 *  - every flight is tracked, and its own cleanup removes its node exactly once;
 *  - a global teardown cancels everything while the tab is hidden, so a backgrounded board cannot leave a node
 *    behind for the next paint.
 *
 * React-unmount cleanup is the caller's job (`cancelAllFlights`), because this module cannot know when a board
 * is torn down; the visibility teardown is installed here so it can never be forgotten.
 */

type IActiveFlight = {
  element: HTMLElement
  animation: Animation
}

const activeFlightsByKey = new Map<string, IActiveFlight>()
let isTeardownInstalled = false
let anonymousFlightSequence = 0

/** A stable key for an animated element: the card it represents, or a unique anonymous id. */
function resolveElementFlightKey(element: HTMLElement): string {
  return element.dataset.cardInstanceId
    ?? element.dataset.handInstanceId
    ?? `anonymous-flight-${anonymousFlightSequence++}`
}

/**
 * Takes ownership of a flight. Any flight already registered under the same key is cancelled first, so a card
 * never has two animations writing its transform at once - and the cancelled flight's own cleanup runs (the
 * animation's `oncancel`), which is what removes its node.
 */
function registerFlight({
  key,
  element,
  animation,
}: {
  key: string
  element: HTMLElement
  animation: Animation
}): void {
  const previousFlight = activeFlightsByKey.get(key)
  if (previousFlight) {
    // Detach before cancelling: the previous cleanup must not unregister the flight we are about to add.
    activeFlightsByKey.delete(key)
    previousFlight.animation.cancel()
  }

  activeFlightsByKey.set(key, { element, animation })
  ensureVisibilityTeardown()
}

/** Releases a flight. Only the flight that still owns its key may release it. */
function unregisterFlight(key: string, animation: Animation): void {
  const flight = activeFlightsByKey.get(key)
  if (!flight || flight.animation !== animation) {
    return
  }

  activeFlightsByKey.delete(key)
}

/** Cancels every flight; each flight's own cleanup runs as its animation cancels. */
function cancelAllFlights(): void {
  for (const key of [...activeFlightsByKey.keys()]) {
    activeFlightsByKey.get(key)?.animation.cancel()
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
  cancelAllFlights,
}
