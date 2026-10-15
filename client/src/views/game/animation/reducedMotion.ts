/**
 * Reduced-motion policy for the board.
 *
 * The board's animations are coupled to the game protocol: the phase-presentation acknowledgement waits for the
 * flights the board registered. That makes "skip the motion" a policy decision with a protocol consequence - a
 * skipped flight must resolve immediately, never leave the acknowledgement (or a queued descriptor) waiting on
 * motion that will not play. This module is the one place that decides.
 */

const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Synchronous read, for the flight primitives and the attack lunge: both decide whether to animate before they
 * start, so neither can register a flight the acknowledgement would then wait on.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches
}

/**
 * The duration a flight should actually run for. `0` means "skip the motion": the caller must resolve its
 * descriptor (and therefore its drain) on the next microtask instead of waiting on an animation.
 */
function resolveFlightDurationMs(durationMs: number): number {
  return prefersReducedMotion() ? 0 : durationMs
}

export { prefersReducedMotion, resolveFlightDurationMs }
