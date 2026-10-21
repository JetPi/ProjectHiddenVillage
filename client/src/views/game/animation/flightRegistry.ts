
type IActiveFlight = {
  element: HTMLElement
  animation: Animation
}

const activeFlightsByKey = new Map<string, IActiveFlight>()
let isTeardownInstalled = false
let anonymousFlightSequence = 0

function resolveElementFlightKey(element: HTMLElement): string {
  return element.dataset.cardInstanceId
    ?? element.dataset.handInstanceId
    ?? `anonymous-flight-${anonymousFlightSequence++}`
}

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
    activeFlightsByKey.delete(key)
    previousFlight.animation.cancel()
  }

  activeFlightsByKey.set(key, { element, animation })
  ensureVisibilityTeardown()
}

function unregisterFlight(key: string, animation: Animation): void {
  const flight = activeFlightsByKey.get(key)
  if (!flight || flight.animation !== animation) {
    return
  }

  activeFlightsByKey.delete(key)
}

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
