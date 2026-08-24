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

export type IGameCardActionExecutionRequest = {
  playerId: string
  actionId: string
  sourceCardInstanceId: string
  selectedTargets?: Array<{
    playerId: string
    zone: string
    cardInstanceId: string
    isEffectResolutionStackTarget?: boolean
    effectResolutionEntryId?: string | null
  }>
  arguments?: Record<string, string>
}

export type IGameStateInvalidatedHandler = (gameId: string) => void
