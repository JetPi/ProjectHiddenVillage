import { useMemo } from 'react'
import type { IGameActionOptionResponse } from '@/services/api/types/game'

function usePassLikeAction({ mappedAvailableActions }:{
  mappedAvailableActions:  IGameActionOptionResponse[]
}){
    const passLikeAction = useMemo(
        () => mappedAvailableActions.find((action) =>
          action.actionId === 'pass-turn'
          || action.actionId === 'turn-end'
          || action.actionId === 'endPhase'
          || action.actionId === 'declare-end-step'
          || action.actionId === 'advance-phase'),
        [mappedAvailableActions],
      )

      return passLikeAction
}

export { usePassLikeAction }