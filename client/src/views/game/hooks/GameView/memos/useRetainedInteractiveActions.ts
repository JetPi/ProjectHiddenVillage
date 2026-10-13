import type { IGameActionOptionResponse } from '@/services/api/types/game'
import { useGameUIStore } from '@/state/gameUIStore'

type IUseRetainedPhaseActionSourceResult = {
  /** The list the phase row paints: live, or the latched interactive list while the HUD is holding. */
  phaseActions: IGameActionOptionResponse[]
  /**
   * True while the HUD holds its last interactive content: the engine is presenting a phase transition, or a
   * MainPhase support reaction window has this board waiting on the opponent.
   */
  isHolding: boolean
}

/**
 * The action list the phase row paints. While the HUD is holding - the engine is presenting a phase transition,
 * or a support reaction window is open against this board - the list is the one latched at the last interactive
 * snapshot, so the chips hold still instead of collapsing on one hop and reopening on the next.
 *
 * The latch lives in `gameUIStore` because it has to outlive renders: it is written by the store's
 * own game-state subscription, never during render.
 */
function useRetainedPhaseActionSource(liveAvailableActions: IGameActionOptionResponse[]): IUseRetainedPhaseActionSourceResult {
  const isPhasePresentationPending = useGameUIStore((state) => state.isPhasePresentationPending)
  const isSupportWindowHudHolding = useGameUIStore((state) => state.isSupportWindowHudHolding)
  const retainedInteractiveAvailableActions = useGameUIStore((state) => state.retainedInteractiveAvailableActions)
  const isHolding = isPhasePresentationPending || isSupportWindowHudHolding

  return {
    phaseActions: isHolding ? retainedInteractiveAvailableActions : liveAvailableActions,
    isHolding,
  }
}

type IUseRetainedActionBlockedResult = {
  /**
   * Whether the chips held by the row should be painted as unusable. While the HUD is holding it is the value
   * latched at the last interactive snapshot, because an acknowledgement or a refresh landing mid-transition
   * would otherwise restyle the chips.
   */
  isActionBlocked: boolean
}

function useRetainedActionBlocked(liveIsActionBlocked: boolean): IUseRetainedActionBlockedResult {
  const isPhasePresentationPending = useGameUIStore((state) => state.isPhasePresentationPending)
  const isSupportWindowHudHolding = useGameUIStore((state) => state.isSupportWindowHudHolding)
  const retainedIsActionBlocked = useGameUIStore((state) => state.retainedIsActionBlocked)
  const isHolding = isPhasePresentationPending || isSupportWindowHudHolding

  return {
    isActionBlocked: isHolding ? retainedIsActionBlocked : liveIsActionBlocked,
  }
}

export { useRetainedActionBlocked, useRetainedPhaseActionSource }
