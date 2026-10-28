import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { buildHubUrl } from '@/services/api/hubUrl'
import { getAuthAccessToken } from '@/state/authSession'
import type {
  ICreateGameForUserRequest,
  IGameInstanceResponse,
  IGameStateResponse,
  IJoinGameAsPlayerRequest,
} from '@/services/api/types/game'
import type {
  IGameCardActionTargetsRequest,
  IGameCardActionTargetsResponse,
  IGameParticipantJoinedHandler,
  IGameCardActionExecutionRequest,
  IGameStateInvalidatedHandler,
  IHubOperationResult,
  IPlayerPhaseActionRequest,
  IResolvePromptRequest,
} from '@/services/api/types/gameHub'
import type {
  IGameChatHistoryResponse,
  IGameChatMessage,
  IGameChatMessagePostedHandler,
} from '@/services/api/types/gameChat'

const EVENT_GAME_STATE_INVALIDATED = 'GameStateInvalidated'
const EVENT_GAME_PARTICIPANT_JOINED = 'GameParticipantJoined'
const EVENT_GAME_CHAT_MESSAGE_POSTED = 'GameChatMessagePosted'
const HUB_ENDPOINT_PATH = '/hubs/games'

function normalizePlayerId(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, '')
}

function normalizeGameId(value: string): string {
  return value.trim().toUpperCase()
}

function createGameHubConnection(): HubConnection {
  return new HubConnectionBuilder()
    .withUrl(buildHubUrl(HUB_ENDPOINT_PATH), {
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
  const result = await connection.invoke<IHubOperationResult<IGameStateResponse>>(methodName, normalizeGameId(gameId))
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

function onGameParticipantJoined(
  connection: HubConnection,
  handler: IGameParticipantJoinedHandler,
): () => void {
  connection.on(EVENT_GAME_PARTICIPANT_JOINED, handler)

  return () => {
    connection.off(EVENT_GAME_PARTICIPANT_JOINED, handler)
  }
}

function onGameChatMessagePosted(
  connection: HubConnection,
  handler: IGameChatMessagePostedHandler,
): () => void {
  connection.on(EVENT_GAME_CHAT_MESSAGE_POSTED, handler)

  return () => {
    connection.off(EVENT_GAME_CHAT_MESSAGE_POSTED, handler)
  }
}

async function subscribeToGame(connection: HubConnection, gameId: string): Promise<void> {
  await connection.invoke('SubscribeToGame', normalizeGameId(gameId))
}

async function unsubscribeFromGame(connection: HubConnection, gameId: string): Promise<void> {
  await connection.invoke('UnsubscribeFromGame', normalizeGameId(gameId))
}

async function getCurrentGameState(
  connection: HubConnection,
  gameId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  return invokeHubStateMethod(connection, 'GetCurrentGameState', gameId)
}

async function acknowledgePhasePresentation(
  connection: HubConnection,
  gameId: string,
  presentationId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  const result = await connection.invoke<IHubOperationResult<IGameStateResponse>>(
    'AcknowledgePhasePresentation',
    normalizeGameId(gameId),
    presentationId,
  )

  return result
}

async function declareAttack(
  connection: HubConnection,
  gameId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  return invokeHubStateMethod(connection, 'AdvancePhase', gameId)
}

/**
 * Resigns from the game: the server ends it on the spot and the opponent wins. It is a plain game-id invocation
 * (no player id, no request body) because the hub derives the resigning player from the auth claim.
 */
async function forfeitGame(
  connection: HubConnection,
  gameId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  return invokeHubStateMethod(connection, 'ForfeitGame', gameId)
}

async function declareEndStep(
  connection: HubConnection,
  gameId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  return invokeHubStateMethod(connection, 'DeclareEndStep', gameId)
}

async function completeEndStep(
  connection: HubConnection,
  gameId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  return invokeHubStateMethod(connection, 'CompleteEndStep', gameId)
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
    normalizeGameId(gameId),
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
    normalizeGameId(gameId),
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
    normalizeGameId(gameId),
    payload,
  )

  return result
}

async function executeCardAction(
  connection: HubConnection,
  gameId: string,
  playerId: string,
  actionId: string,
  sourceCardInstanceId: string,
  selectedTargets?: IGameCardActionExecutionRequest['selectedTargets'],
  executionArguments?: IGameCardActionExecutionRequest['arguments'],
): Promise<IHubOperationResult<IGameStateResponse>> {
  const payload: IGameCardActionExecutionRequest = {
    playerId: normalizePlayerId(playerId),
    actionId,
    sourceCardInstanceId,
    selectedTargets,
    arguments: executionArguments,
  }

  const result = await connection.invoke<IHubOperationResult<IGameStateResponse>>(
    'ExecuteCardAction',
    normalizeGameId(gameId),
    payload,
  )

  return result
}

async function getCardActionTargets(
  connection: HubConnection,
  gameId: string,
  playerId: string,
  actionId: string,
  sourceCardInstanceId: string,
  executionArguments?: IGameCardActionTargetsRequest['arguments'],
): Promise<IHubOperationResult<IGameCardActionTargetsResponse>> {
  const payload: IGameCardActionTargetsRequest = {
    playerId: normalizePlayerId(playerId),
    actionId,
    sourceCardInstanceId,
    arguments: executionArguments,
  }

  const result = await connection.invoke<IHubOperationResult<IGameCardActionTargetsResponse>>(
    'GetCardActionTargets',
    normalizeGameId(gameId),
    payload,
  )

  return result
}

/**
 * Asks the opponent to let the board go back one move. It is not a game action: the request itself freezes the
 * table, so it must not be blocked by the HUD's action gate.
 */
async function requestRedo(
  connection: HubConnection,
  gameId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  return invokeHubStateMethod(connection, 'RequestRedo', gameId)
}

async function respondToRedo(
  connection: HubConnection,
  gameId: string,
  requestId: string,
  accepted: boolean,
): Promise<IHubOperationResult<IGameStateResponse>> {
  const result = await connection.invoke<IHubOperationResult<IGameStateResponse>>(
    'RespondToRedo',
    normalizeGameId(gameId),
    requestId,
    accepted,
  )

  return result
}

async function cancelRedo(
  connection: HubConnection,
  gameId: string,
): Promise<IHubOperationResult<IGameStateResponse>> {
  return invokeHubStateMethod(connection, 'CancelRedo', gameId)
}

async function sendGameChatMessage(
  connection: HubConnection,
  gameId: string,
  text: string,
): Promise<IHubOperationResult<IGameChatMessage>> {
  const result = await connection.invoke<IHubOperationResult<IGameChatMessage>>(
    'SendGameChatMessage',
    normalizeGameId(gameId),
    { text },
  )

  return result
}

async function getGameChatHistory(
  connection: HubConnection,
  gameId: string,
  sinceSequence: number,
): Promise<IHubOperationResult<IGameChatHistoryResponse>> {
  const result = await connection.invoke<IHubOperationResult<IGameChatHistoryResponse>>(
    'GetGameChatHistory',
    normalizeGameId(gameId),
    sinceSequence,
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
      normalizeGameId(gameCode),
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
  onGameParticipantJoined,
  onGameChatMessagePosted,
  subscribeToGame,
  unsubscribeFromGame,
  getCurrentGameState,
  acknowledgePhasePresentation,
  forfeitGame,
  requestRedo,
  respondToRedo,
  cancelRedo,
  sendGameChatMessage,
  getGameChatHistory,
  declareAttack,
  declareEndStep,
  completeEndStep,
  resolvePrompt,
  declarePassInActionStep,
  declareActionInActionStep,
  getCardActionTargets,
  executeCardAction,
  createGameForUserViaHub,
  joinGameAsPlayerViaHub,
}

export type {
  IHubOperationResult,
}
