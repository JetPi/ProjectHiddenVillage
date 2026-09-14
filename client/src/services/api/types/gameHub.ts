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
  // Authoritative tribute material groups: one entry per material the summon consumes, with the
  // number of distinct cards it needs. `isGeneric` marks the catch-all "any" material.
  materialRequirements?: Array<{
    label: string
    requiredCount: number
    isGeneric?: boolean
  }> | null
}

export type IGameStateInvalidatedHandler = (gameId: string) => void
export type IGameParticipantJoinedHandler = (gameId: string) => void
