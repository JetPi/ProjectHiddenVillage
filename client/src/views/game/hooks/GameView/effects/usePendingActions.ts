import type { IGameActionOptionResponse, IGameCardInstanceResponse } from "@/services/api/types/game"
import { useEffect } from "react"


function usePendingActions({
  pendingSetSupportCardInstanceId,
  mappedAvailableActions,
  bottomHandCards,
  setPendingSetSupportCardInstanceId,
}: IPendingActionsProps) {
    useEffect(() => {
        if (!pendingSetSupportCardInstanceId) {
          return
        }
    
        const pendingActionId = `set-support:${pendingSetSupportCardInstanceId}`
        const stillAvailableInGlobalActions = mappedAvailableActions.some((option) =>
          option.actionId === pendingActionId)
        const pendingCard = bottomHandCards.find((card) => card.instanceId === pendingSetSupportCardInstanceId)
        const stillAvailableOnCard = (pendingCard?.availableActions ?? []).some((option) => option.actionId === pendingActionId)
        const stillAvailable = stillAvailableInGlobalActions || stillAvailableOnCard
    
        if (!stillAvailable) {
          const timeoutId = window.setTimeout(() => {
            setPendingSetSupportCardInstanceId(null)
          }, 0)
    
          return () => {
            window.clearTimeout(timeoutId)
          }
        }
      }, [bottomHandCards, mappedAvailableActions, pendingSetSupportCardInstanceId, setPendingSetSupportCardInstanceId])
}

interface IPendingActionsProps {
  pendingSetSupportCardInstanceId: string | null,
  mappedAvailableActions: IGameActionOptionResponse[],
  bottomHandCards: IGameCardInstanceResponse[],
  setPendingSetSupportCardInstanceId: React.Dispatch<React.SetStateAction<string | null>>,
}

export { usePendingActions }