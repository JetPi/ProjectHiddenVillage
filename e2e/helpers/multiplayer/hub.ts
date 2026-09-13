import { expect } from '@playwright/test'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { API_BASE_URL } from './api'
import type { PlayerAuth } from './types'

function buildHubConnection(accessToken: string, userId: string) {
  const connection = new HubConnectionBuilder()
    .withUrl(`${API_BASE_URL}/hubs/games`, {
      accessTokenFactory: () => accessToken,
      headers: {
        'X-Dev-User-Id': userId,
      },
      withCredentials: false,
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()

  // These helper connections invoke hub mutations but do not otherwise subscribe
  // to gameplay updates; attach no-op handlers to avoid unhandled method warnings.
  connection.on('GameStateInvalidated', () => {})
  connection.on('GameParticipantJoined', () => {})

  return connection
}

export type HubInvocationResult<TValue = unknown> = {
  succeeded: boolean
  value?: TValue
  errorCode?: string | null
  errorDescription?: string | null
}

async function invokeGameHubMethod<TValue>(
  player: PlayerAuth,
  methodName: string,
  args: unknown[] = [],
): Promise<HubInvocationResult<TValue>> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()
    return await connection.invoke<HubInvocationResult<TValue>>(methodName, ...args)
  } finally {
    await connection.stop()
  }
}

export function describeHubFailure(methodLabel: string, result: HubInvocationResult): string {
  return `${result.errorCode ?? methodLabel}: ${result.errorDescription ?? 'Unknown error'}`
}

// `GamePhaseHandlingService` maps a thrown `InvalidOperationException` to `{operation}.InvalidState`.
// For `AdvancePhase` that is the guard in `InMemoryGameInstanceRegistry` rejecting an advance while
// a prompt is pending — i.e. the read-then-act race the resilient helpers absorb.
export const ADVANCE_PHASE_INVALID_STATE_ERROR_CODE = 'Game.AdvancePhase.InvalidState'

export async function resolvePromptViaHub(
  gameCode: string,
  player: PlayerAuth,
  selectedOption: string,
): Promise<void> {
  const result = await invokeGameHubMethod(player, 'ResolvePrompt', [
    gameCode.toUpperCase(),
    {
      requestedPlayerId: player.normalizedUserId,
      selectedOption,
    },
  ])

  expect(result.succeeded, describeHubFailure('Hub.ResolvePrompt', result)).toBeTruthy()
}

export async function advancePhaseViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const result = await tryAdvancePhaseViaHub(gameCode, player)
  expect(result.succeeded, describeHubFailure('Hub.AdvancePhase', result)).toBeTruthy()
}

// Non-asserting variant for callers that must survive a read-then-act race: between reading the
// state (which reports `advance-phase` as available because no prompt is pending) and this call,
// a prompt can be created and the server then rejects with `Game.AdvancePhase.InvalidState`.
// Callers inspect the result instead of failing the spec.
export async function tryAdvancePhaseViaHub(
  gameCode: string,
  player: PlayerAuth,
): Promise<HubInvocationResult> {
  return await invokeGameHubMethod(player, 'AdvancePhase', [gameCode.toUpperCase()])
}

export async function declareEndStepViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const result = await invokeGameHubMethod(player, 'DeclareEndStep', [gameCode.toUpperCase()])
  expect(result.succeeded, describeHubFailure('Hub.DeclareEndStep', result)).toBeTruthy()
}

export async function completeEndStepViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const result = await invokeGameHubMethod(player, 'CompleteEndStep', [gameCode.toUpperCase()])
  expect(result.succeeded, describeHubFailure('Hub.CompleteEndStep', result)).toBeTruthy()
}

export async function declarePassInActionStepViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const result = await invokeGameHubMethod(player, 'DeclarePassInActionStep', [
    gameCode.toUpperCase(),
    {
      playerId: player.normalizedUserId,
    },
  ])

  expect(result.succeeded, describeHubFailure('Hub.DeclarePassInActionStep', result)).toBeTruthy()
}

export async function executeBattleActionViaHub(
  gameCode: string,
  player: PlayerAuth,
  actionId: string,
  sourceCardInstanceId: string,
): Promise<{ targetCardInstanceId: string; targetZone: string; targetPlayerId: string }> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const targetsResult = await connection.invoke<{
      succeeded: boolean
      value?: {
        validTargets: Array<{
          playerId: string
          zone: string
          cardInstanceId: string
        }>
      }
      errorCode?: string | null
      errorDescription?: string | null
    }>('GetCardActionTargets', gameCode.toUpperCase(), {
      playerId: player.normalizedUserId,
      actionId,
      sourceCardInstanceId,
    })

    expect(targetsResult.succeeded, `${targetsResult.errorCode ?? 'Hub.GetCardActionTargets'}: ${targetsResult.errorDescription ?? 'Unknown error'}`).toBeTruthy()

    const validTargets = targetsResult.value?.validTargets ?? []
    expect(validTargets.length).toBeGreaterThan(0)

    const selectedTarget = validTargets.find((target) => target.zone === 'Leader') ?? validTargets[0]

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>('ExecuteCardAction', gameCode.toUpperCase(), {
      playerId: player.normalizedUserId,
      actionId,
      sourceCardInstanceId,
      selectedTargets: [selectedTarget],
    })

    expect(result.succeeded, `${result.errorCode ?? 'Hub.ExecuteCardAction'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()

    return {
      targetCardInstanceId: selectedTarget.cardInstanceId,
      targetZone: selectedTarget.zone,
      targetPlayerId: selectedTarget.playerId,
    }
  } finally {
    await connection.stop()
  }
}

export async function getCardActionTargetsViaHub(
  gameCode: string,
  player: PlayerAuth,
  actionId: string,
  sourceCardInstanceId: string,
): Promise<Array<{ playerId: string; zone: string; cardInstanceId: string }>> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const targetsResult = await connection.invoke<{
      succeeded: boolean
      value?: {
        validTargets: Array<{
          playerId: string
          zone: string
          cardInstanceId: string
        }>
      }
      errorCode?: string | null
      errorDescription?: string | null
    }>('GetCardActionTargets', gameCode.toUpperCase(), {
      playerId: player.normalizedUserId,
      actionId,
      sourceCardInstanceId,
    })

    expect(targetsResult.succeeded, `${targetsResult.errorCode ?? 'Hub.GetCardActionTargets'}: ${targetsResult.errorDescription ?? 'Unknown error'}`).toBeTruthy()

    return targetsResult.value?.validTargets ?? []
  } finally {
    await connection.stop()
  }
}
