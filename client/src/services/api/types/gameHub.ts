export type IHubOperationResult<T> = {
  succeeded: boolean
  value: T | null
  errorCode: string | null
  errorDescription: string | null
}

export type IPlayerPhaseActionRequest = {
  playerId: string
}

export type IResolvePromptRequest = {
  requestedPlayerId: string
  selectedOption: string
}

export type IGameStateInvalidatedHandler = (gameId: string) => void
