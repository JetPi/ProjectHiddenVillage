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

export async function resolvePromptViaHub(
  gameCode: string,
  player: PlayerAuth,
  selectedOption: string,
): Promise<void> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>(
      'ResolvePrompt',
      gameCode.toUpperCase(),
      {
        requestedPlayerId: player.normalizedUserId,
        selectedOption,
      },
    )

    expect(result.succeeded, `${result.errorCode ?? 'Hub.ResolvePrompt'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()
  } finally {
    await connection.stop()
  }
}

export async function advancePhaseViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>('AdvancePhase', gameCode.toUpperCase())

    expect(result.succeeded, `${result.errorCode ?? 'Hub.AdvancePhase'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()
  } finally {
    await connection.stop()
  }
}

export async function declareEndStepViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>('DeclareEndStep', gameCode.toUpperCase())

    expect(result.succeeded, `${result.errorCode ?? 'Hub.DeclareEndStep'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()
  } finally {
    await connection.stop()
  }
}

export async function completeEndStepViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>('CompleteEndStep', gameCode.toUpperCase())

    expect(result.succeeded, `${result.errorCode ?? 'Hub.CompleteEndStep'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()
  } finally {
    await connection.stop()
  }
}

export async function declarePassInActionStepViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>('DeclarePassInActionStep', gameCode.toUpperCase(), {
      playerId: player.normalizedUserId,
    })

    expect(result.succeeded, `${result.errorCode ?? 'Hub.DeclarePassInActionStep'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()
  } finally {
    await connection.stop()
  }
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
