import type { IGameStateResponse } from '@/services/api/types/game'
import type { IAttackFlowLinkState } from '@/views/game/types/targeting/attackTargeting'
import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react'

function useOptimisticResting({ gameState, setActiveAttackLink, setOptimisticRestedByInstanceId, lastSubmittedAttackSourceRef }: IUseOptimisticRestingProps) {
    useEffect(() => {
        setOptimisticRestedByInstanceId((previous) => {
            const previousKeys = Object.keys(previous)
            if (previousKeys.length === 0) {
                return previous
            }

            const nextState: Record<string, boolean> = {}

            for (const [instanceId, shouldRemainOptimistic] of Object.entries(previous)) {
                if (!shouldRemainOptimistic) {
                    continue
                }

                const normalizedInstanceId = instanceId.trim().toLowerCase()
                const matchedCard = gameState.players
                    .flatMap((player) => player.characterField)
                    .find((card) => card.instanceId.trim().toLowerCase() === normalizedInstanceId)

                if (!matchedCard) {
                    continue
                }

                if (matchedCard.isRested || matchedCard.isExhausted) {
                    continue
                }

                nextState[instanceId] = true
            }

            const nextKeys = Object.keys(nextState)
            if (nextKeys.length === 0) {
                lastSubmittedAttackSourceRef.current = null
                return {}
            }

            if (
                nextKeys.length === previousKeys.length
                && nextKeys.every((key) => previous[key] === true)
            ) {
                return previous
            }

            return nextState
        })

        if (!gameState.isAttackSequencePending) {
            setActiveAttackLink(null)
            return
        }
    }, [gameState, lastSubmittedAttackSourceRef, setActiveAttackLink, setOptimisticRestedByInstanceId])
}

interface IUseOptimisticRestingProps {
    gameState: IGameStateResponse,
    setActiveAttackLink: Dispatch<SetStateAction<IAttackFlowLinkState | null>>,
    setOptimisticRestedByInstanceId: Dispatch<SetStateAction<Record<string, boolean>>>,
    lastSubmittedAttackSourceRef: RefObject<string | null>
}

export { useOptimisticResting }