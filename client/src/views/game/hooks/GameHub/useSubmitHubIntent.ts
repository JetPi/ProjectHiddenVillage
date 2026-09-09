import { useCallback, type RefObject } from "react"
import type { ISubmitHubIntentRequest } from "@/views/game/types"
import { HubConnectionState, type HubConnection } from "@microsoft/signalr"
import { useGameHubStore } from "@/state/gameHubStore"
import type { IGameStateResponse } from "@/services/api/types/game"
import { advancePhase, completeEndStep, declareActionInActionStep, declareEndStep, declarePassInActionStep, executeCardAction, resolvePrompt, type IHubOperationResult } from "@/services/api/gameHubApi"

function isAdvanceWhilePromptPendingMessage(message: string | null | undefined): boolean {
    if (!message) {
        return false
    }

    return message.toLowerCase().includes('cannot advance phase while a prompt is pending')
}

function shouldSuppressAdvancePromptPendingError(
    request: ISubmitHubIntentRequest,
    result: IHubOperationResult<IGameStateResponse>,
): boolean {
    if (request.intent !== 'advance-phase') {
        return false
    }

    return isAdvanceWhilePromptPendingMessage(result.errorDescription)
}

function resolveHubErrorMessage(result: IHubOperationResult<IGameStateResponse>): string {
    if (result.errorDescription) {
        return result.errorDescription
    }

    if (result.errorCode) {
        return result.errorCode
    }

    return 'Hub operation failed.'
}

function useSubmitHubIntent({ connectionRef, gameState, authUserId, gameId }: ISubmitHubProps) {
    const setActionError = useGameHubStore((state) => state.setActionError)
    const setActionPending = useGameHubStore((state) => state.setActionPending)
    const setGameState = useGameHubStore((state) => state.setGameState)

    return useCallback(
        async (request: ISubmitHubIntentRequest): Promise<void> => {
            const currentConnection = connectionRef.current
            const currentStoreState = useGameHubStore.getState()
            const currentGameState = currentStoreState.gameState ?? gameState

            if (!currentConnection || currentConnection.state !== HubConnectionState.Connected) {
                setActionError('Game hub is not connected.')
                return
            }

            if (currentStoreState.isActionPending) {
                return
            }

            const intent = request.intent

            if (!authUserId && intent !== 'advance-phase') {
                setActionError('You must be logged in to perform this action.')
                return
            }

            if (intent === 'advance-phase') {
                if (currentGameState?.pendingPrompt) {
                    return
                }
                const hasEnabledAdvancePhaseAction = (currentGameState?.availableActions ?? []).some(
                    (action) => action.actionId === 'advance-phase' && action.isEnabled,
                )

                if (!hasEnabledAdvancePhaseAction) {
                    return
                }
            }

            setActionPending(true)
            setActionError(null)

            try {
                let result: IHubOperationResult<IGameStateResponse>

                switch(intent){
                    case 'pass-turn':
                        result = await declarePassInActionStep(currentConnection, gameId, authUserId ?? '')
                        break
                    case 'declare-action':
                        result = await declareActionInActionStep(currentConnection, gameId, authUserId ?? '')
                        break
                    case 'execute-card-action':
                        result = await executeCardAction(
                            currentConnection,
                            gameId,
                            authUserId ?? '',
                            request.actionId,
                            request.sourceCardInstanceId,
                            request.selectedTargets,
                            request.arguments,
                        )
                        break
                    case 'declare-end-step':
                        result = await declareEndStep(currentConnection, gameId)
                        break
                    case 'complete-end-step':
                        result = await completeEndStep(currentConnection, gameId)
                        break
                    case 'resolve-prompt':
                        result = await resolvePrompt(currentConnection, gameId, authUserId ?? '', request.selectedOption)
                        break
                    default:
                        result = await advancePhase(currentConnection, gameId)
                }

                if (!result.succeeded || !result.value) {
                    if (shouldSuppressAdvancePromptPendingError(request, result)) {
                        console.warn('[GameHub] advance-phase ignored because a prompt is pending.', {
                            gameId,
                            errorCode: result.errorCode,
                            errorDescription: result.errorDescription,
                        })
                        return
                    }

                    setActionError(resolveHubErrorMessage(result))
                    return
                }

                setActionError(null)
                setGameState(result.value)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Hub action failed.'

                if (request.intent === 'advance-phase' && isAdvanceWhilePromptPendingMessage(message)) {
                    console.warn('[GameHub] advance-phase ignored because a prompt is pending.', {
                        gameId,
                        errorMessage: message,
                    })
                    return
                }

                setActionError(message)
            } finally {
                setActionPending(false)
            }
        },
        [authUserId, connectionRef, gameId, gameState, setActionError, setActionPending, setGameState],
    )
}

interface ISubmitHubProps {
    connectionRef: RefObject<HubConnection | null>
    gameState: IGameStateResponse | null
    authUserId?: string | null
    gameId: string
}

export { useSubmitHubIntent }