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

export type IGameCardActionTargetsRequest = {
  playerId: string
  actionId: string
  sourceCardInstanceId: string
  arguments?: Record<string, string>
}

export type IGameCardActionTargetsResponse = {
  actionId: string
  sourceCardInstanceId: string
  isEnabled: boolean
  disabledReason: string | null
  minimumTargetCount: number | null
  maximumTargetCount: number | null
  exactTargetCount: number | null
  autoSelectAllValidTargets: boolean
  validTargets: Array<{
    playerId: string
    zone: string
    cardInstanceId: string
    slotId?: string | null
    isEffectResolutionStackTarget?: boolean
    effectResolutionEntryId?: string | null
  }>
  requirementLabels?: Array<{
    cardInstanceId: string
    requirementLabels: string[]
  }> | null
  materialRequirements?: Array<{
    label: string
    requiredCount: number
    isGeneric?: boolean
  }> | null
}

export type IGameStateInvalidatedHandler = (gameId: string) => void
export type IGameParticipantJoinedHandler = (gameId: string) => void

/**
 * The rematch table this board was opened from has been dropped: the opponent released it, or it lapsed. Fired at the
 * table's group before the table is retired, so the seated player is told why the board is going away.
 */
export type IRematchReleasedHandler = (gameId: string, reason: string) => void
