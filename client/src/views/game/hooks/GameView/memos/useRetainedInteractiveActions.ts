import type { IGameActionOptionResponse } from '@/services/api/types/game'
import { useGameUIStore } from '@/state/gameUIStore'

type IUseRetainedPhaseActionSourceResult = {
  phaseActions: IGameActionOptionResponse[]
  isHolding: boolean
}

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
