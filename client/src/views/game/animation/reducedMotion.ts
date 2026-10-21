
const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches
}

function resolveFlightDurationMs(durationMs: number): number {
  return prefersReducedMotion() ? 0 : durationMs
}

export { prefersReducedMotion, resolveFlightDurationMs }
