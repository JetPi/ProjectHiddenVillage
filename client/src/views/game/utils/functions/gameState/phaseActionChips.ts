import type { IGameActionOptionResponse } from '@/services/api/types/game'

/**
 * Global actions that are never a player's affordance.
 *
 * - `declare-action` is an implicit step of the ActionStep, so it is never drawn.
 * - `advance-phase` is the engine's system action for a non-interactive phase. With the phase automation on the
 *   engine advances those phases itself and stops on a presentation receipt instead (`pendingPresentation`), so
 *   the action is not published at all; the filter stays as a safety net for a table the automation is off for,
 *   where a system hop must still never be drawn as a chip.
 */
const SYSTEM_PHASE_ACTION_IDS = new Set(['declare-action', 'advance-phase'])

/**
 * One phase action chip as the row paints it: the action itself plus whether it could actually be
 * used when the list was taken. Both are carried together so a held chip keeps the exact look -
 * label and enabled/disabled treatment - it had before an automatic transition started, instead of
 * being restyled by the pending flag that toggles on every auto-advance signal.
 */
type IPhaseActionChip = {
  action: IGameActionOptionResponse
  isUsable: boolean
}

function resolvePhaseActionChips(
  availableActions: IGameActionOptionResponse[],
  isActionBlocked: boolean,
): IPhaseActionChip[] {
  return availableActions
    .filter((action) => !SYSTEM_PHASE_ACTION_IDS.has(action.actionId))
    .map((action) => ({
      action,
      isUsable: !isActionBlocked && action.isEnabled,
    }))
}

/**
 * Content equality for the latched action list. The server sends a fresh list object on every push,
 * so a reference check would re-latch - and re-render its readers - on every unrelated state push.
 */
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

export { SYSTEM_PHASE_ACTION_IDS, areActionListsEqual, resolvePhaseActionChips }
export type { IPhaseActionChip }
