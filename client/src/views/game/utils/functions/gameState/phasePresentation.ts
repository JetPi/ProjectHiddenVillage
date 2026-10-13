import type { IPhasePresentationResponse } from '@/services/api/types/game'
import { normalizePlayerId } from './gameViewFunctions'

/**
 * The floor when the board DID register an animation for this presentation. The animations are what pace the
 * transition; this only keeps a very short flight from flickering past before it is acknowledged.
 */
const PHASE_PRESENTATION_ANIMATED_FLOOR_MS = 120

/**
 * How long each kind of engine transition is worth showing when the board registered **no** animation for it.
 * With the animations gating the transitions that actually draw something, these idle floors only have to keep
 * a contentless stop readable, so they are small: the old 600-700 ms floors were pure dead time on a stop like
 * `Ready` that shows nothing but a card standing up (a rotation that registers no animation).
 */
const PHASE_PRESENTATION_MINIMUM_MS: Record<string, number> = {
  InitialDeal: 200,
  Ready: 220,
  Draw: 260,
  Damage: 420,
  BattleEnd: 320,
  TurnEnd: 220,
}

/** Used for a kind this build does not know yet (the server can add one before the client catches up). */
const PHASE_PRESENTATION_FALLBACK_MINIMUM_MS = 220

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
 * When the acknowledgement may be sent: never before the board's animations settle and never later than the hard
 * cap. Animation-first: when the board registered an animation, its own end is the gate (with only a tiny floor
 * so a very short flight is still shown); only a stop that animates nothing falls back to its kind's small idle
 * floor. Pure on purpose - it is the piece of this handshake worth testing on its own.
 */
function resolvePresentationAckAtMs({
  kind,
  seenAtMs,
  animationsSettleAtMs,
  hardCapMs = PHASE_PRESENTATION_HARD_CAP_MS,
}: IResolvePresentationAckAtArgs): number {
  const hardCapAtMs = seenAtMs + hardCapMs
  const settledAtMs = animationsSettleAtMs === null
    ? seenAtMs + resolvePresentationMinimumMs(kind)
    : Math.max(seenAtMs + PHASE_PRESENTATION_ANIMATED_FLOOR_MS, animationsSettleAtMs)

  return Math.min(settledAtMs, hardCapAtMs)
}

export {
  PHASE_PRESENTATION_ANIMATED_FLOOR_MS,
  PHASE_PRESENTATION_FALLBACK_MINIMUM_MS,
  PHASE_PRESENTATION_HARD_CAP_MS,
  PHASE_PRESENTATION_MINIMUM_MS,
  PHASE_PRESENTATION_RETRY_MS,
  isPresentationAwaitingAck,
  resolvePresentationAckAtMs,
  resolvePresentationMinimumMs,
}
export type { IResolvePresentationAckAtArgs }
