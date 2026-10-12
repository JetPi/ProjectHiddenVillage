import type { IPhasePresentationResponse } from '@/services/api/types/game'
import { normalizePlayerId } from './gameViewFunctions'

/**
 * How long each kind of engine transition is worth showing on this board before the client is allowed to
 * acknowledge it. The number is a floor, not a schedule: the board's own animations (the draw flight, a card's
 * ghost flight, the ready step) usually decide when the presentation is actually over, and these minimums only
 * guarantee that a transition nobody animates (a phase with no visible change) is still readable.
 */
const PHASE_PRESENTATION_MINIMUM_MS: Record<string, number> = {
  InitialDeal: 900,
  Ready: 700,
  Draw: 700,
  Damage: 700,
  BattleEnd: 700,
  TurnEnd: 400,
}

/** Used for a kind this build does not know yet (the server can add one before the client catches up). */
const PHASE_PRESENTATION_FALLBACK_MINIMUM_MS = 600

/**
 * The hard cap on how long one presentation may hold the table. A board that never reports its animations as
 * finished - a stuck flight, a tab throttled in the background - must not be able to stall the engine for good;
 * the acknowledgement goes through and the server's own watchdog is the second line of defence.
 */
const PHASE_PRESENTATION_HARD_CAP_MS = 2_500

/** How long the client waits before re-checking a presentation it has already acknowledged. */
const PHASE_PRESENTATION_RETRY_MS = 250

function resolvePresentationMinimumMs(kind: string): number {
  return PHASE_PRESENTATION_MINIMUM_MS[kind] ?? PHASE_PRESENTATION_FALLBACK_MINIMUM_MS
}

/**
 * True when this client still owes the engine an acknowledgement for the presentation: it is one of the required
 * players and it has not acked yet. A player who is connected twice (two tabs) acks once - the second tab sees
 * itself in `acknowledgedPlayerIds` and stays quiet.
 */
function isPresentationAwaitingAck(
  presentation: IPhasePresentationResponse | null | undefined,
  playerId: string | undefined,
): boolean {
  if (!presentation || !playerId) {
    return false
  }

  const normalizedPlayerId = normalizePlayerId(playerId)
  if (!normalizedPlayerId) {
    return false
  }

  const isRequired = presentation.requiredAckPlayerIds.some(
    (requiredPlayerId) => normalizePlayerId(requiredPlayerId) === normalizedPlayerId,
  )
  if (!isRequired) {
    return false
  }

  return !presentation.acknowledgedPlayerIds.some(
    (acknowledgedPlayerId) => normalizePlayerId(acknowledgedPlayerId) === normalizedPlayerId,
  )
}

/** Drops the animation deadlines that have already passed, so the registry cannot grow without bound. */
function pruneSettledAnimations(animationEndsAtByKey: Map<string, number>, nowMs: number): void {
  animationEndsAtByKey.forEach((endsAt, key) => {
    if (endsAt <= nowMs) {
      animationEndsAtByKey.delete(key)
    }
  })
}

/**
 * The moment every animation the board registered has finished, or null when nothing is in flight. This is what
 * lets the acknowledgement wait for the real flights (draw, ghosts) instead of guessing from the phase name.
 */
function resolveAnimationsSettleAtMs(
  animationEndsAtByKey: ReadonlyMap<string, number>,
  nowMs: number,
): number | null {
  let settleAt: number | null = null

  animationEndsAtByKey.forEach((endsAt) => {
    if (endsAt <= nowMs) {
      return
    }

    settleAt = settleAt === null ? endsAt : Math.max(settleAt, endsAt)
  })

  return settleAt
}

type IResolvePresentationAckAtArgs = {
  /** The presentation kind the server published (`Draw`, `Ready`, ...). */
  kind: string
  /** When this client first saw this presentation. */
  seenAtMs: number
  /** When the board's animations are expected to settle, or null when nothing is in flight. */
  animationsSettleAtMs: number | null
  hardCapMs?: number
}

/**
 * When the acknowledgement may be sent: never before this kind's minimum and never before the board's animations
 * settle, and never later than the hard cap. Pure on purpose - it is the piece of this handshake worth testing on
 * its own.
 */
function resolvePresentationAckAtMs({
  kind,
  seenAtMs,
  animationsSettleAtMs,
  hardCapMs = PHASE_PRESENTATION_HARD_CAP_MS,
}: IResolvePresentationAckAtArgs): number {
  const minimumAtMs = seenAtMs + resolvePresentationMinimumMs(kind)
  const hardCapAtMs = seenAtMs + hardCapMs
  const settledAtMs = animationsSettleAtMs === null ? minimumAtMs : Math.max(minimumAtMs, animationsSettleAtMs)

  return Math.min(settledAtMs, hardCapAtMs)
}

export {
  PHASE_PRESENTATION_FALLBACK_MINIMUM_MS,
  PHASE_PRESENTATION_HARD_CAP_MS,
  PHASE_PRESENTATION_MINIMUM_MS,
  PHASE_PRESENTATION_RETRY_MS,
  isPresentationAwaitingAck,
  pruneSettledAnimations,
  resolveAnimationsSettleAtMs,
  resolvePresentationAckAtMs,
  resolvePresentationMinimumMs,
}
export type { IResolvePresentationAckAtArgs }
