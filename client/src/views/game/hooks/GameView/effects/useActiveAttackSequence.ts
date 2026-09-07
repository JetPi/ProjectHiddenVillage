import type { IGameStateResponse } from "@/services/api/types/game"
import type { IAttackFlowLinkState } from "@/views/game/types"
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react"

function useActiveAttackSequence({ gameState, setActiveAttackLink, setOptimisticRestedByInstanceId, lastSubmittedAttackSourceRef, actionError }: IUseActiveAttackSequenceProps): void {
    useEffect(() => {
        if (!actionError || gameState.isAttackSequencePending) {
          return
        }
    
        const sourceCardInstanceId = lastSubmittedAttackSourceRef.current
        if (!sourceCardInstanceId) {
          return
        }
    
        setOptimisticRestedByInstanceId((previous) => {
          const nextState = { ...previous }
          delete nextState[sourceCardInstanceId]
          return nextState
        })
        setActiveAttackLink(null)
        lastSubmittedAttackSourceRef.current = null
      }, [actionError, gameState.isAttackSequencePending, setActiveAttackLink, setOptimisticRestedByInstanceId, lastSubmittedAttackSourceRef])
}

interface IUseActiveAttackSequenceProps {
    gameState: IGameStateResponse,
    setActiveAttackLink: Dispatch<SetStateAction<IAttackFlowLinkState | null>>,
    setOptimisticRestedByInstanceId: Dispatch<SetStateAction<Record<string, boolean>>>,
    lastSubmittedAttackSourceRef: RefObject<string | null>,
    actionError: string | null
}

export { useActiveAttackSequence }