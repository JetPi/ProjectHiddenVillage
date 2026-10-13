import { useCallback, type RefObject } from "react"
import type { ISubmitHubIntentRequest } from "@/views/game/types"
import { HubConnectionState, type HubConnection } from "@microsoft/signalr"
import { useGameHubStore } from "@/state/gameHubStore"
import type { IGameStateResponse } from "@/services/api/types/game"
import { completeEndStep, declareActionInActionStep, declareAttack, declareEndStep, declarePassInActionStep, executeCardAction, resolvePrompt, type IHubOperationResult } from "@/services/api/gameHubApi"

function resolveHubErrorMessage(result: IHubOperationResult<IGameStateResponse>): string {
    if (result.errorDescription) {
        return result.errorDescription
    }

    if (result.errorCode) {
        return result.errorCode
    }

    return 'Hub operation failed.'
}

function useSubmitHubIntent({ connectionRef, gameState, authUserId, gameId, requestGameStateRefresh }: ISubmitHubProps) {
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

            if (!authUserId) {
                setActionError('You must be logged in to perform this action.')
                return
            }

            if (intent === 'declare-attack' && currentGameState?.pendingPrompt) {
                // A phase option cannot be taken while a decision is owed: the prompt owns the board.
                return
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
                    case 'declare-attack':
                        result = await declareAttack(currentConnection, gameId)
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
                        // Unreachable: the union covers every intent, and there is no fallback action left now
                        // that the engine drives the non-interactive phases itself.
                        throw new Error(`Unsupported game intent '${intent}'.`)
                }

                if (!result.succeeded || !result.value) {
                    const errorMessage = resolveHubErrorMessage(result)
                    console.error('[GameHub] hub intent failed.', {
                        intent,
                        gameId,
                        errorCode: result.errorCode,
                        errorDescription: result.errorDescription,
                    })
                    setActionError(errorMessage)

                    // The server can partially apply an action before rejecting it (for example a battle
                    // action that rests the attacker before an unsupported "On Attack" effect aborts).
                    // Re-pull the authoritative state so the table never stays on a stale snapshot that
                    // no button can progress.
                    requestGameStateRefresh(currentConnection)
                    return
                }

                setActionError(null)
                setGameState(result.value)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Hub action failed.'

                setActionError(message)
                console.error('[GameHub] hub intent threw.', { intent, gameId, message })
                requestGameStateRefresh(currentConnection)
            } finally {
                setActionPending(false)
            }
        },
        [authUserId, connectionRef, gameId, gameState, requestGameStateRefresh, setActionError, setActionPending, setGameState],
    )
}

interface ISubmitHubProps {
    connectionRef: RefObject<HubConnection | null>
    gameState: IGameStateResponse | null
    authUserId?: string | null
    gameId: string
    /** Coalesced re-sync used after a failed intent so both clients recover without a manual reload. */
    requestGameStateRefresh: (connection: HubConnection) => void
}

export { useSubmitHubIntent }