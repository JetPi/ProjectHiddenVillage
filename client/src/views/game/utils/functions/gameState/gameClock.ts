import type { IGameClockResponse } from '@/services/api/types/game'
import { normalizePlayerId } from './gameViewFunctions'

/** How close to the deadline the badge starts warning, in seconds. */
const CLOCK_WARNING_SECONDS = 10

export type IGameClockView = {
  isEnabled: boolean
  isOwnClock: boolean
  secondsRemaining: number | null
  isWarning: boolean
  strikes: number
  forfeitAt: number
  poolSeconds: number | null
}

/**
 * The seconds left in the current stop, counted down locally from the server's absolute deadline.
 *
 * The server sends `deadlineUtc` plus its own `serverNowUtc`: the difference is the remaining time at the moment the
 * payload was produced, and only the time since it was received is added on top. That keeps a client whose system
 * clock is wrong from rendering a wrong countdown (and from drifting between pushes).
 */
export function resolveClockSecondsRemaining(
  clock: IGameClockResponse | null | undefined,
  receivedAtMs: number,
  nowMs: number,
): number | null {
  if (!clock?.isEnabled || !clock.deadlineUtc) {
    return null
  }

  const deadlineMs = Date.parse(clock.deadlineUtc)
  if (Number.isNaN(deadlineMs)) {
    return null
  }

  const elapsedSinceReceiptMs = Math.max(0, nowMs - receivedAtMs)
  const serverNowMs = Date.parse(clock.serverNowUtc)

  const remainingMs = Number.isNaN(serverNowMs)
    ? (clock.secondsRemainingInStop ?? 0) * 1000 - elapsedSinceReceiptMs
    : deadlineMs - serverNowMs - elapsedSinceReceiptMs

  return Math.max(0, Math.ceil(remainingMs / 1000))
}

/**
 * Everything the badge renders, derived in one place so the visible countdown, the warning state and the strike
 * pips can never disagree.
 */
export function resolveGameClockView(
  clock: IGameClockResponse | null | undefined,
  authUserId: string | undefined,
  receivedAtMs: number,
  nowMs: number,
): IGameClockView | null {
  if (!clock) {
    return null
  }

  const normalizedAuthUserId = authUserId ? normalizePlayerId(authUserId) : ''
  const normalizedOwnerId = clock.owningPlayerId ? normalizePlayerId(clock.owningPlayerId) : ''
  const ownClockPlayer = normalizedAuthUserId
    ? clock.players.find((player) => normalizePlayerId(player.playerId) === normalizedAuthUserId)
    : undefined

  const secondsRemaining = resolveClockSecondsRemaining(clock, receivedAtMs, nowMs)

  return {
    isEnabled: clock.isEnabled,
    isOwnClock: normalizedOwnerId !== '' && normalizedOwnerId === normalizedAuthUserId,
    secondsRemaining,
    isWarning: secondsRemaining !== null && secondsRemaining > 0 && secondsRemaining <= CLOCK_WARNING_SECONDS,
    strikes: ownClockPlayer?.consecutiveTimeouts ?? 0,
    forfeitAt: ownClockPlayer?.timeoutsBeforeForfeit ?? 0,
    poolSeconds: ownClockPlayer?.secondsRemainingInPool ?? null,
  }
}

/** Clock formatting for the badge: minutes and zero-padded seconds, never negative. */
export function formatClockSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
