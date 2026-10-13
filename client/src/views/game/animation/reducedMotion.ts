import { useEffect, useState } from 'react'

/**
 * Reduced-motion policy for the board.
 *
 * The board's animations are coupled to the game protocol: the phase-presentation acknowledgement waits
 * for the flights the board registered. That makes "skip the motion" a policy decision with a protocol
 * consequence - a skipped flight must resolve immediately, never leave the acknowledgement (or a
 * queued descriptor) waiting on motion that will not play. This module is the one place that decides.
 */

const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'

/** Synchronous read, for non-React sinks (the director's scheduler, animation callbacks). */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false
  }

  return window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches
}

/** Reactive form for components/effects that must re-render when the preference changes. */
function usePrefersReducedMotion(): boolean {
  const [isReduced, setIsReduced] = useState(prefersReducedMotion)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQueryList = window.matchMedia(REDUCED_MOTION_MEDIA_QUERY)
    const handleChange = (event: MediaQueryListEvent): void => {
      setIsReduced(event.matches)
    }

    mediaQueryList.addEventListener('change', handleChange)
    return () => mediaQueryList.removeEventListener('change', handleChange)
  }, [])

  return isReduced
}

/**
 * The duration a flight should actually run for. `0` means "skip the motion": the caller must resolve
 * its descriptor (and therefore its drain) on the next microtask instead of waiting on an animation.
 */
function resolveFlightDurationMs(durationMs: number): number {
  return prefersReducedMotion() ? 0 : durationMs
}

export { prefersReducedMotion, usePrefersReducedMotion, resolveFlightDurationMs }
