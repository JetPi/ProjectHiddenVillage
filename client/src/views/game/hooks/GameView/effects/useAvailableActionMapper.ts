import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { IDerivedGameViewState, IPendingCardTargetingState } from '@/views/game/types'
import { useEffect, type Dispatch, type SetStateAction } from 'react'

function useAvailableActionMapper({
  pendingCardTargeting,
  mappedAvailableActions,
  derivedGameState,
  setPendingCardTargeting,
}: IAvailableActionMapperProps) {
    useEffect(() => {
        if (!pendingCardTargeting || pendingCardTargeting.kind !== 'battle') {
          return
        }
    
        const matchingBattleAction = mappedAvailableActions.find((option) =>
          option.actionId === pendingCardTargeting.actionId)
    
        const sourceCard = (derivedGameState.currentPlayer?.characterField ?? []).find((card) =>
          card.instanceId.trim().toLowerCase() === pendingCardTargeting.sourceCardInstanceId.trim().toLowerCase())
    
        const matchingSourceCardAction = (sourceCard?.availableActions ?? []).find((option) =>
          option.actionId === pendingCardTargeting.actionId)
    
        const sourceCardStillControlledByCurrentPlayer = (derivedGameState.currentPlayer?.characterField ?? []).some((card) =>
          card.instanceId.trim().toLowerCase() === pendingCardTargeting.sourceCardInstanceId.trim().toLowerCase())
    
        const stillAvailable = sourceCardStillControlledByCurrentPlayer
          && (Boolean(matchingBattleAction?.isEnabled) || Boolean(matchingSourceCardAction?.isEnabled))
    
        if (stillAvailable) {
          return
        }
    
        const timeoutId = window.setTimeout(() => {
          setPendingCardTargeting(null)
        }, 0)
    
        return () => {
          window.clearTimeout(timeoutId)
        }
      }, [derivedGameState.currentPlayer?.characterField, mappedAvailableActions, pendingCardTargeting, setPendingCardTargeting])
}

interface IAvailableActionMapperProps {
  pendingCardTargeting: IPendingCardTargetingState | null,
  mappedAvailableActions: IGameActionOptionResponse[],
  derivedGameState: IDerivedGameViewState,
  setPendingCardTargeting:  Dispatch<SetStateAction<IPendingCardTargetingState| null>>,
}

export { useAvailableActionMapper }