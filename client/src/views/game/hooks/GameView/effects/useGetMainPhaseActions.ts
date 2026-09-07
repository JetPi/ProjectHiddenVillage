
import type { IGameCardInstanceResponse } from '@/services/api/types/game'
import { useEffect, useRef } from 'react'
import type { IDerivedGameViewState, IUseGameHubStateResult } from '@/views/game/types'
import { getIsMissingActiveMainPhaseOptions } from '@/views/game/utils/functions'

function useGetMainPhaseActions(props: IGetMainPhaseActionsProps) {
    const {
        gameHubState,
        derivedGameState,
        isActionPending,
        hasPendingPromptFlag,
        bottomHandCards,
        refreshGameState,
        authUserId,
    } = props
    const { bottomLeaderCard } = derivedGameState
    const { gameState, isConnected } = gameHubState

    const isMissingActiveMainPhaseOptions = getIsMissingActiveMainPhaseOptions({ gameHubState, derivedGameState, bottomHandCards, authUserId })

    const missingOptionsRefreshAttemptsRef = useRef<Record<string, number>>({})
    const isMissingOptionsRefreshInFlightRef = useRef(false)

    useEffect(() => {
        if (!isMissingActiveMainPhaseOptions) {
            return
        }

        const snapshotKey = `${gameState.turnNumber}:${gameState.phase}`
        const attempts = missingOptionsRefreshAttemptsRef.current[snapshotKey] ?? 0
        if (attempts >= 3 || isMissingOptionsRefreshInFlightRef.current) {
            return
        }

        missingOptionsRefreshAttemptsRef.current[snapshotKey] = attempts + 1
        isMissingOptionsRefreshInFlightRef.current = true

        void refreshGameState()
            .catch(() => {
                // Best effort only; a later hub event will refresh the state again.
            })
            .finally(() => {
                isMissingOptionsRefreshInFlightRef.current = false
            })
    }, [
        bottomHandCards,
        bottomLeaderCard,
        gameState.phase,
        gameState.turnNumber,
        hasPendingPromptFlag,
        isActionPending,
        isConnected,
        isMissingActiveMainPhaseOptions,
        refreshGameState,
        missingOptionsRefreshAttemptsRef,
        isMissingOptionsRefreshInFlightRef,
    ])
}

type IGetMainPhaseActionsProps = {
    gameHubState: IUseGameHubStateResult
    derivedGameState: IDerivedGameViewState
    authUserId: string | undefined
    isActionPending: boolean
    hasPendingPromptFlag: boolean
    bottomHandCards: IGameCardInstanceResponse[]
    refreshGameState: () => Promise<boolean>
}

export { useGetMainPhaseActions }