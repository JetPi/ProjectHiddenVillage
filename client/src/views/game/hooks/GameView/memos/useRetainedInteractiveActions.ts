import type { IGameActionOptionResponse } from '@/services/api/types/game'
import { useGameUIStore } from '@/state/gameUIStore'

type IUseRetainedPhaseActionSourceResult = {
  /** The list the phase row paints: live, or the latched interactive list while a presentation is pending. */
  phaseActions: IGameActionOptionResponse[]
  /** True while the engine is holding a phase presentation this board is answering. */
  isPresentationPending: boolean
}

/**
 * The action list the phase row paints. While the engine is holding a phase presentation the list is the
 * one latched at the last interactive snapshot, so the chips hold still through the engine-driven chain
 * instead of collapsing on one hop and reopening on the next.
 *
 * The latch lives in `gameUIStore` because it has to outlive renders: it is written by the store's
 * own game-state subscription, never during render.
 */
function useRetainedPhaseActionSource(liveAvailableActions: IGameActionOptionResponse[]): IUseRetainedPhaseActionSourceResult {
  const isPresentationPending = useGameUIStore((state) => state.isPhasePresentationPending)
  const retainedInteractiveAvailableActions = useGameUIStore((state) => state.retainedInteractiveAvailableActions)

  return {
    phaseActions: isPresentationPending ? retainedInteractiveAvailableActions : liveAvailableActions,
    isPresentationPending,
  }
}

type IUseRetainedActionBlockedResult = {
  /**
   * Whether the chips held by the row should be painted as unusable. While a presentation is pending it is the
   * value latched at the last interactive snapshot, because the acknowledgement and the state it pushes would
   * otherwise restyle the chips in the middle of a transition.
   */
  isActionBlocked: boolean
}

function useRetainedActionBlocked(liveIsActionBlocked: boolean): IUseRetainedActionBlockedResult {
  const isPresentationPending = useGameUIStore((state) => state.isPhasePresentationPending)
  const retainedIsActionBlocked = useGameUIStore((state) => state.retainedIsActionBlocked)

  return {
    isActionBlocked: isPresentationPending ? retainedIsActionBlocked : liveIsActionBlocked,
  }
}

export { useRetainedActionBlocked, useRetainedPhaseActionSource }
