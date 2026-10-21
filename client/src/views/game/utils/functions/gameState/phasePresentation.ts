import type { IPhasePresentationResponse } from '@/services/api/types/game'
import { normalizePlayerId } from './gameViewFunctions'

const PHASE_PRESENTATION_ANIMATED_FLOOR_MS = 120

const PHASE_PRESENTATION_MINIMUM_MS: Record<string, number> = {
  InitialDeal: 200,
  Ready: 220,
  Draw: 260,
  Damage: 420,
  BattleEnd: 320,
  TurnEnd: 220,
}

const PHASE_PRESENTATION_FALLBACK_MINIMUM_MS = 220

const PHASE_PRESENTATION_HARD_CAP_MS = 2_500

const PHASE_PRESENTATION_RETRY_MS = 250

function resolvePresentationMinimumMs(kind: string): number {
  return PHASE_PRESENTATION_MINIMUM_MS[kind] ?? PHASE_PRESENTATION_FALLBACK_MINIMUM_MS
}

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
  kind: string
  seenAtMs: number
  animationsSettleAtMs: number | null
  hardCapMs?: number
}

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
