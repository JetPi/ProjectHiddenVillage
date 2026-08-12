import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { getAuthAccessToken } from '../../state/authSession'
import type {
  ICreateGameForUserRequest,
  IGameInstanceResponse,
  IGameStateResponse,
  IJoinGameAsPlayerRequest,
} from './types/game'
import type {
  IGameStateInvalidatedHandler,
  IHubOperationResult,
  IPlayerPhaseActionRequest,
  IResolvePromptRequest,
} from './types/gameHub'

const EVENT_GAME_STATE_INVALIDATED = 'GameStateInvalidated'
const HUB_ENDPOINT_PATH = '/hubs/games'
const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001'
const hubBaseUrl = defaultApiBaseUrl.endsWith('/')
  ? defaultApiBaseUrl.slice(0, -1)
  : defaultApiBaseUrl

function normalizePlayerId(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, '')
}

function createGameHubConnection(): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(`${hubBaseUrl}${HUB_ENDPOINT_PATH}`, {
      accessTokenFactory: () => getAuthAccessToken() ?? '',
      withCredentials: false,
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()
}

function resolveHubOperationErrorMessage(result: IHubOperationResult<unknown>): string {
  return result.errorDescription || result.errorCode || 'Hub operation failed.'
}

async function invokeHubStateMethod(
  connection: HubConnection,
  methodName: string,
  gameId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  const result = await connection.invoke<IHubOperationResult<IGameStateResponse>>(methodName, gameId)
  return result
}

async function connectGameHub(connection: HubConnection): Promise<void> {
  if (connection.state === 'Connected' || connection.state === 'Connecting') {
    return
  }

  await connection.start()
}

async function disconnectGameHub(connection: HubConnection): Promise<void> {
  if (connection.state === 'Disconnected') {
    return
  }

  await connection.stop()
}

function onGameStateInvalidated(
  connection: HubConnection,
  handler: IGameStateInvalidatedHandler,
): () => void {
  connection.on(EVENT_GAME_STATE_INVALIDATED, handler)

  return () => {
    connection.off(EVENT_GAME_STATE_INVALIDATED, handler)
  }
}

async function subscribeToGame(connection: HubConnection, gameId: string): Promise<void> {
  await connection.invoke('SubscribeToGame', gameId)
}

async function unsubscribeFromGame(connection: HubConnection, gameId: string): Promise<void> {
  await connection.invoke('UnsubscribeFromGame', gameId)
}

async function getCurrentGameState(
  connection: HubConnection,
  gameId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  return invokeHubStateMethod(connection, 'GetCurrentGameState', gameId)
}

async function advancePhase(
  connection: HubConnection,
  gameId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  return invokeHubStateMethod(connection, 'AdvancePhase', gameId)
}

async function declarePassInActionStep(
  connection: HubConnection,
  gameId: string,
  playerId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  const payload: IPlayerPhaseActionRequest = {
    playerId: normalizePlayerId(playerId),
  }

  const result = await connection.invoke<IHubOperationResult<IGameStateResponse>>(
    'DeclarePassInActionStep',
    gameId,
    payload,
  )

  return result
}

async function declareActionInActionStep(
  connection: HubConnection,
  gameId: string,
  playerId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  const payload: IPlayerPhaseActionRequest = {
    playerId: normalizePlayerId(playerId),
  }

  const result = await connection.invoke<IHubOperationResult<IGameStateResponse>>(
    'DeclareActionInActionStep',
    gameId,
    payload,
  )

  return result
}

async function resolvePrompt(
  connection: HubConnection,
  gameId: string,
  requestedPlayerId: string,
  selectedOption: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  const payload: IResolvePromptRequest = {
    requestedPlayerId: normalizePlayerId(requestedPlayerId),
    selectedOption,
  }

  const result = await connection.invoke<IHubOperationResult<IGameStateResponse>>(
    'ResolvePrompt',
    gameId,
    payload,
  )

  return result
}

async function createGameForUserViaHub(
  request: ICreateGameForUserRequest,
  preferredGameCode?: string,
): Promise<IGameInstanceResponse> {
  const connection = createGameHubConnection()

  try {
    await connectGameHub(connection)

    const result = await connection.invoke<IHubOperationResult<IGameStateResponse>>(
      'CreateGame',
      request,
      preferredGameCode ?? null,
    )

    if (!result.succeeded || !result.value) {
      throw new Error(resolveHubOperationErrorMessage(result))
    }

    return {
      id: result.value.gameId,
    }
  } finally {
    await disconnectGameHub(connection)
  }
}

async function joinGameAsPlayerViaHub(
  gameCode: string,
  request: IJoinGameAsPlayerRequest,
): Promise<IGameInstanceResponse> {
  const connection = createGameHubConnection()

  try {
    await connectGameHub(connection)

    const result = await connection.invoke<IHubOperationResult<IGameStateResponse>>(
      'JoinGame',
      gameCode,
      request,
    )

    if (!result.succeeded || !result.value) {
      throw new Error(resolveHubOperationErrorMessage(result))
    }

    return {
      id: result.value.gameId,
    }
  } finally {
    await disconnectGameHub(connection)
  }
}

export {
  createGameHubConnection,
  connectGameHub,
  disconnectGameHub,
  onGameStateInvalidated,
  subscribeToGame,
  unsubscribeFromGame,
  getCurrentGameState,
  advancePhase,
  resolvePrompt,
  declarePassInActionStep,
  declareActionInActionStep,
  createGameForUserViaHub,
  joinGameAsPlayerViaHub,
}

export type {
  IHubOperationResult,
}
