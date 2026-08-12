import { useCallback, useEffect, useMemo, useRef } from 'react'
import { HubConnection, HubConnectionState } from '@microsoft/signalr'
import {
  advancePhase,
  connectGameHub,
  createGameHubConnection,
  declareActionInActionStep,
  declarePassInActionStep,
  disconnectGameHub,
  getCurrentGameState,
  onGameStateInvalidated,
  resolvePrompt,
  subscribeToGame,
  unsubscribeFromGame,
  type IHubOperationResult,
} from '../../../services/api/gameHubApi'
import type { IGameStateResponse } from '../../../services/api/gameApi'
import { useGameHubStore } from '../../../state/gameHubStore'
import type { ISubmitHubIntentRequest, IUseGameHubStateResult } from '../types/hub'

function resolveHubErrorMessage(result: IHubOperationResult<IGameStateResponse>): string {
  if (result.errorDescription) {
    return result.errorDescription
  }

  if (result.errorCode) {
    return result.errorCode
  }

  return 'Hub operation failed.'
}

function useGameHubState(
  gameId: string,
  initialGameState: IGameStateResponse,
  authUserId: string | undefined,
): IUseGameHubStateResult {
  const connectionRef = useRef<HubConnection | null>(null)
  const gameStateFromStore = useGameHubStore((state) => state.gameState)
  const isConnected = useGameHubStore((state) => state.isConnected)
  const connectionError = useGameHubStore((state) => state.connectionError)
  const actionError = useGameHubStore((state) => state.actionError)
  const isActionPending = useGameHubStore((state) => state.isActionPending)
  const initializeGameSession = useGameHubStore((state) => state.initializeGameSession)
  const setGameState = useGameHubStore((state) => state.setGameState)
  const setConnected = useGameHubStore((state) => state.setConnected)
  const setActionPending = useGameHubStore((state) => state.setActionPending)
  const setConnectionError = useGameHubStore((state) => state.setConnectionError)
  const setActionError = useGameHubStore((state) => state.setActionError)
  const resetConnectionState = useGameHubStore((state) => state.resetConnectionState)

  const gameState = gameStateFromStore ?? initialGameState

  useEffect(() => {
    initializeGameSession(gameId, initialGameState)
  }, [gameId, initialGameState, initializeGameSession])

  const refreshCurrentGameState = useCallback(
    async (currentConnection: HubConnection) => {
      const result = await getCurrentGameState(currentConnection, gameId)
      if (!result.succeeded || !result.value) {
        setConnectionError(resolveHubErrorMessage(result))
        return
      }

      setConnectionError(null)
      setGameState(result.value)
    },
    [gameId, setConnectionError, setGameState],
  )

  useEffect(() => {
    const nextConnection = createGameHubConnection()
    connectionRef.current = nextConnection

    let isDisposed = false
    let disposeInvalidationHandler = () => {}

    async function connectAndSubscribe(): Promise<void> {
      try {
        await connectGameHub(nextConnection)
        if (isDisposed) {
          return
        }

        await subscribeToGame(nextConnection, gameId)
        if (isDisposed) {
          return
        }

        disposeInvalidationHandler = onGameStateInvalidated(nextConnection, (updatedGameId) => {
          if (updatedGameId.trim().toLowerCase() !== gameId.trim().toLowerCase()) {
            return
          }

          void refreshCurrentGameState(nextConnection)
        })

        await refreshCurrentGameState(nextConnection)
        if (isDisposed) {
          return
        }

        setConnected(nextConnection.state === HubConnectionState.Connected)
      } catch (error) {
        if (isDisposed) {
          return
        }

        const message = error instanceof Error ? error.message : 'Unable to connect to game hub.'
        setConnectionError(message)
        setConnected(false)
      }
    }

    void connectAndSubscribe()

    return () => {
      isDisposed = true
      resetConnectionState()
      disposeInvalidationHandler()
      connectionRef.current = null

      void (async () => {
        try {
          await unsubscribeFromGame(nextConnection, gameId)
        } catch {
          // Best effort only; disconnect follows immediately.
        }

        await disconnectGameHub(nextConnection)
      })()
    }
  }, [gameId, refreshCurrentGameState, resetConnectionState, setConnected, setConnectionError])

  const submitHubIntent = useCallback(
    async (request: ISubmitHubIntentRequest): Promise<void> => {
      const currentConnection = connectionRef.current

      if (!currentConnection || currentConnection.state !== HubConnectionState.Connected) {
        setActionError('Game hub is not connected.')
        return
      }

      if (!authUserId && request.intent !== 'advance-phase') {
        setActionError('You must be logged in to perform this action.')
        return
      }

      setActionPending(true)
      setActionError(null)

      try {
        let result: IHubOperationResult<IGameStateResponse>

        if (request.intent === 'pass-turn') {
          result = await declarePassInActionStep(currentConnection, gameId, authUserId ?? '')
        } else if (request.intent === 'declare-action') {
          result = await declareActionInActionStep(currentConnection, gameId, authUserId ?? '')
        } else if (request.intent === 'resolve-prompt') {
          result = await resolvePrompt(currentConnection, gameId, authUserId ?? '', request.selectedOption)
        } else {
          result = await advancePhase(currentConnection, gameId)
        }

        if (!result.succeeded || !result.value) {
          setActionError(resolveHubErrorMessage(result))
          return
        }

        setActionError(null)
        setGameState(result.value)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Hub action failed.'
        setActionError(message)
      } finally {
        setActionPending(false)
      }
    },
    [authUserId, gameId, setActionError, setActionPending, setGameState],
  )

  return useMemo(
    () => ({
      gameState,
      isConnected,
      isActionPending,
      connectionError,
      actionError,
      submitHubIntent,
    }),
    [actionError, connectionError, gameState, isActionPending, isConnected, submitHubIntent],
  )
}

export {
  useGameHubState,
}
