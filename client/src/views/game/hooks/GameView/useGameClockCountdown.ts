import { useMemo, useSyncExternalStore } from 'react'
import type { IGameClockResponse } from '@/services/api/types/game'
import { resolveGameClockView, type IGameClockView } from '@/views/game/utils/functions/gameState/gameClock'

/** How often the clock redraws while any badge is mounted. */
const CLOCK_TICK_MS = 250

const tickListeners = new Set<() => void>()
const anchorByClock = new WeakMap<IGameClockResponse, number>()

let tickHandle: number | null = null
let lastTickMs = Date.now()

/**
 * One shared ticker for every clock badge on the page, driven as an external store so the hook never needs a
 * setState-in-effect (and never reads the wall clock during render). It runs only while a badge is subscribed, so an
 * untimed game, a finished game or a table parked on a system step costs no timers.
 */
function subscribeToClockTicks(onTick: () => void): () => void {
  tickListeners.add(onTick)

  if (tickHandle === null) {
    tickHandle = window.setInterval(() => {
      lastTickMs = Date.now()
      tickListeners.forEach((listener) => listener())
    }, CLOCK_TICK_MS)
  }

  return () => {
    tickListeners.delete(onTick)

    if (tickListeners.size === 0 && tickHandle !== null) {
      window.clearInterval(tickHandle)
      tickHandle = null
    }
  }
}

function getClockTickSnapshot(): number {
  return lastTickMs
}

/**
 * When this payload arrived, as far as the shared ticker can tell. One anchor per payload object: a push, a reload or
 * an action replaces the object, which re-anchors the countdown against the new server time.
 */
function resolveClockAnchor(clock: IGameClockResponse): number {
  const stored = anchorByClock.get(clock)

  if (stored !== undefined) {
    return stored
  }

  anchorByClock.set(clock, lastTickMs)
  return lastTickMs
}

/**
 * The action clock as the board renders it: the countdown ticks locally against the server's absolute deadline and
 * re-anchors on every new payload, so a reload or a slow frame cannot drift the displayed time away from the engine's.
 */
export function useGameClockCountdown(
  clock: IGameClockResponse | null | undefined,
  authUserId: string | undefined,
): IGameClockView | null {
  const nowMs = useSyncExternalStore(subscribeToClockTicks, getClockTickSnapshot, getClockTickSnapshot)

  return useMemo(() => {
    if (!clock) {
      return null
    }

    return resolveGameClockView(clock, authUserId, resolveClockAnchor(clock), nowMs)
  }, [clock, authUserId, nowMs])
}
