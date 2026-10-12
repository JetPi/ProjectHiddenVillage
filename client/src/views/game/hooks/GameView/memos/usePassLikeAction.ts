import { useMemo } from 'react'
import type { IGameActionOptionResponse } from '@/services/api/types/game'

function usePassLikeAction({ mappedAvailableActions }:{
  mappedAvailableActions:  IGameActionOptionResponse[]
}){
    // The system `advance-phase` action is deliberately absent: the engine drives the non-interactive phases
    // itself now, so the only turn-ending affordances left are the ones a player really decides (pass, end turn,
    // declare the end step).
    const passLikeAction = useMemo(
        () => mappedAvailableActions.find((action) =>
          action.actionId === 'pass-turn'
          || action.actionId === 'turn-end'
          || action.actionId === 'endPhase'
          || action.actionId === 'declare-end-step'),
        [mappedAvailableActions],
      )

      return passLikeAction
}

export { usePassLikeAction }