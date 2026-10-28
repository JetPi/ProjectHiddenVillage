import { expect } from '@playwright/test'
import { HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr'
import type { HubConnection } from '@microsoft/signalr'
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

  // These helper connections invoke hub mutations but never call SubscribeToGame, so they are not
  // registered as watchers: presence is recorded by that subscription, not by connecting. That is
  // what makes it safe to keep a helper connection open for a whole test - it cannot join the
  // phase-presentation acknowledgement set and park the engine. Attach no-op handlers so the
  // broadcasts these connections never asked for cannot surface as unhandled method warnings.
  connection.on('GameStateInvalidated', () => {})
  connection.on('GameParticipantJoined', () => {})
  connection.on('GameChatMessagePosted', () => {})

  return connection
}

export type HubInvocationResult<TValue = unknown> = {
  succeeded: boolean
  value?: TValue
  errorCode?: string | null
  errorDescription?: string | null
}

type CachedConnection = {
  connection: HubConnection
  /** In-flight `start()`, shared so two concurrent calls cannot start the same connection twice. */
  starting: Promise<void> | null
}

/**
 * One connection per player, reused for every hub call in a test.
 *
 * Each call used to build, start and stop its own connection, so a scenario issuing a few dozen
 * mutations paid a full SignalR handshake for each one. The cache lives until
 * `closeHelperConnections()` runs (from `closeMultiplayerPages`, i.e. once per test).
 *
 * Deliberately no retry around `invoke`: a mutation that fails after the server processed it must
 * surface as a failure, not be replayed and applied twice.
 */
const cachedConnections = new Map<string, CachedConnection>()

function connectionKey(player: PlayerAuth): string {
  return `${player.userId}:${player.session.accessToken}`
}

async function getHubConnection(player: PlayerAuth): Promise<HubConnection> {
  const key = connectionKey(player)
  let cached = cachedConnections.get(key)

  if (!cached) {
    cached = {
      connection: buildHubConnection(player.session.accessToken, player.userId),
      starting: null,
    }
    cachedConnections.set(key, cached)
  }

  const entry = cached

  if (entry.connection.state === HubConnectionState.Disconnected) {
    entry.starting = entry.connection.start()
  }

  if (entry.starting) {
    try {
      await entry.starting
    } finally {
      entry.starting = null
    }
  }

  return entry.connection
}

/**
 * Stops and forgets every cached helper connection. Called once per test, after the browser contexts
 * close, so a dropped socket can never outlive the scenario that opened it.
 */
export async function closeHelperConnections(): Promise<void> {
  const entries = Array.from(cachedConnections.values())
  cachedConnections.clear()

  await Promise.all(entries.map(async ({ connection }) => {
    if (connection.state === HubConnectionState.Disconnected) {
      return
    }

    try {
      await connection.stop()
    } catch {
      // A connection the server already dropped is already closed; nothing left to release.
    }
  }))
}

async function invokeGameHubMethod<TValue>(
  player: PlayerAuth,
  methodName: string,
  args: unknown[] = [],
): Promise<HubInvocationResult<TValue>> {
  const connection = await getHubConnection(player)
  return await connection.invoke<HubInvocationResult<TValue>>(methodName, ...args)
}

export function describeHubFailure(methodLabel: string, result: HubInvocationResult): string {
  return `${result.errorCode ?? methodLabel}: ${result.errorDescription ?? 'Unknown error'}`
}

// `GamePhaseHandlingService` maps a thrown `InvalidOperationException` to `{operation}.InvalidState`.
// For `AdvancePhase` that is the guard in `InMemoryGameInstanceRegistry` rejecting an advance while
// a prompt is pending — i.e. the read-then-act race the resilient helpers absorb.
export const ADVANCE_PHASE_INVALID_STATE_ERROR_CODE = 'Game.AdvancePhase.InvalidState'

// The engine drives the non-interactive phases itself and holds the table on each transition until every
// connected client has acknowledged that its board finished presenting it. While that receipt is outstanding
// the hub rejects **every** other mutation (`ExecuteAuthorizedGameMutation`), so an API-driven helper has to
// wait the gate out: the browser pages are the clients that own the acknowledgement.
export const PHASE_PRESENTATION_PENDING_ERROR_CODE = 'Game.PhasePresentation.Pending'

type PendingPresentationState = {
  pendingPresentation?: { presentationId: string } | null
}

/**
 * Resolves true once the engine is not parked on a phase presentation, false when the wait timed out. Reads the
 * state through `GetCurrentGameState`, which is a read and therefore not gated.
 */
export async function waitForNoPendingPresentation(
  gameCode: string,
  player: PlayerAuth,
  timeoutMs = 10_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const stateResult = await invokeGameHubMethod<PendingPresentationState>(
      player,
      'GetCurrentGameState',
      [gameCode.toUpperCase()],
    )

    if (stateResult.succeeded && !stateResult.value?.pendingPresentation) {
      return true
    }

    if (Date.now() >= deadline) {
      return false
    }

    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

// The end-step pair races the same way: the caller reads a state where `turn-end` is enabled (or
// already declared the end step) and the phase moves on before/inside the next call, so the server
// rejects with `{operation}.InvalidState` (`ExecuteRegistryOperation` prefixes the operation name).
export const DECLARE_END_STEP_INVALID_STATE_ERROR_CODE = 'Game.DeclareEndStep.InvalidState'
export const COMPLETE_END_STEP_INVALID_STATE_ERROR_CODE = 'Game.CompleteEndStep.InvalidState'

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
  const result = await tryDeclareEndStepViaHub(gameCode, player)
  expect(result.succeeded, describeHubFailure('Hub.DeclareEndStep', result)).toBeTruthy()
}

// Non-asserting variants for `progressToNextDecisionWindow`, which reads a state first and can lose
// the race against the server's own phase progression (see the error-code notes above).
export async function tryDeclareEndStepViaHub(gameCode: string, player: PlayerAuth): Promise<HubInvocationResult> {
  return await invokeGameHubMethod(player, 'DeclareEndStep', [gameCode.toUpperCase()])
}

export async function completeEndStepViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const result = await tryCompleteEndStepViaHub(gameCode, player)
  expect(result.succeeded, describeHubFailure('Hub.CompleteEndStep', result)).toBeTruthy()
}

export async function tryCompleteEndStepViaHub(gameCode: string, player: PlayerAuth): Promise<HubInvocationResult> {
  return await invokeGameHubMethod(player, 'CompleteEndStep', [gameCode.toUpperCase()])
}

export async function executeCardActionViaHub(
  gameCode: string,
  player: PlayerAuth,
  actionId: string,
  sourceCardInstanceId: string,
  selectedTargets: Array<{ playerId: string; zone: string; cardInstanceId: string }> = [],
): Promise<void> {
  const result = await invokeGameHubMethod(player, 'ExecuteCardAction', [
    gameCode.toUpperCase(),
    {
      playerId: player.normalizedUserId,
      actionId,
      sourceCardInstanceId,
      selectedTargets,
    },
  ])

  expect(result.succeeded, describeHubFailure('Hub.ExecuteCardAction', result)).toBeTruthy()
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
  const connection = await getHubConnection(player)

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
}

export async function getCardActionTargetsViaHub(
  gameCode: string,
  player: PlayerAuth,
  actionId: string,
  sourceCardInstanceId: string,
): Promise<Array<{ playerId: string; zone: string; cardInstanceId: string }>> {
  const connection = await getHubConnection(player)

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
}

export type GameChatMessageResponse = {
  sequence: number
  messageId: string
  senderPlayerId: string
  sentAtUtc: string
  text: string
}

export async function sendGameChatMessageViaHub(
  gameCode: string,
  player: PlayerAuth,
  text: string,
): Promise<HubInvocationResult<GameChatMessageResponse>> {
  return await invokeGameHubMethod<GameChatMessageResponse>(player, 'SendGameChatMessage', [
    gameCode.toUpperCase(),
    { text },
  ])
}

export async function getGameChatHistoryViaHub(
  gameCode: string,
  player: PlayerAuth,
  sinceSequence = 0,
): Promise<HubInvocationResult<{ gameId: string; latestSequence: number; messages: GameChatMessageResponse[] }>> {
  return await invokeGameHubMethod(player, 'GetGameChatHistory', [gameCode.toUpperCase(), sinceSequence])
}
