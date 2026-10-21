import type { IGameActionOptionResponse } from '@/services/api/types/game'

const SYSTEM_PHASE_ACTION_IDS = new Set(['declare-action', 'advance-phase'])

const PROMPT_RESOLVE_ACTION_ID_PREFIX = 'resolve-prompt:'

function isPromptResolveAction(action: IGameActionOptionResponse): boolean {
  return action.actionId.startsWith(PROMPT_RESOLVE_ACTION_ID_PREFIX)
}

type IPhaseActionChip = {
  action: IGameActionOptionResponse
  isUsable: boolean
}

function resolvePhaseActionChips(
  availableActions: IGameActionOptionResponse[],
  isActionBlocked: boolean,
): IPhaseActionChip[] {
  return availableActions
    .filter((action) => !SYSTEM_PHASE_ACTION_IDS.has(action.actionId) && !isPromptResolveAction(action))
    .map((action) => ({
      action,
      isUsable: !isActionBlocked && action.isEnabled,
    }))
}

function areActionListsEqual(
  left: IGameActionOptionResponse[],
  right: IGameActionOptionResponse[],
): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((action, index) => {
    const candidate = right[index]
    return candidate !== undefined
      && candidate.actionId === action.actionId
      && candidate.label === action.label
      && candidate.isEnabled === action.isEnabled
      && candidate.disabledReason === action.disabledReason
  })
}

export {
  PROMPT_RESOLVE_ACTION_ID_PREFIX,
  SYSTEM_PHASE_ACTION_IDS,
  areActionListsEqual,
  isPromptResolveAction,
  resolvePhaseActionChips,
}
export type { IPhaseActionChip }
