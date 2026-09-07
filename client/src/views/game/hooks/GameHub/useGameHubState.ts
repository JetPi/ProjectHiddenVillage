import { useCallback, useEffect, useMemo, useRef } from 'react'
import { HubConnection, HubConnectionState } from '@microsoft/signalr'
import {
  connectGameHub,
  createGameHubConnection,
  disconnectGameHub,
  getCardActionTargets,
  getCurrentGameState,
  onGameParticipantJoined,
  onGameStateInvalidated,
  subscribeToGame,
  unsubscribeFromGame,
  type IHubOperationResult,
} from '@/services/api/gameHubApi'
import { useGameStateQuery } from '@/services/queries/gameStateQueries'
import type { IGameStateResponse } from '@/services/api/gameApi'
import type { IGameCardActionTargetsResponse } from '@/services/api/types/gameHub'
import { useGameHubStore } from '@/state/gameHubStore'
import type { IUseGameHubStateResult } from '@/views/game/types'
import { useSubmitHubIntent } from './useSubmitHubIntent'

const HUB_CONNECT_MAX_ATTEMPTS = 3
const HUB_CONNECT_RETRY_DELAY_MS = 600

function isConnectionConnected(connection: HubConnection): boolean {
  return connection.state === HubConnectionState.Connected
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

function resolveGenericHubErrorMessage(result: IHubOperationResult<unknown>): string {
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
  const setConnectionError = useGameHubStore((state) => state.setConnectionError)
  const setActionError = useGameHubStore((state) => state.setActionError)
  const resetConnectionState = useGameHubStore((state) => state.resetConnectionState)
  const { refetch: refetchGameStateSnapshot } = useGameStateQuery(gameId, { enabled: false })

  const gameState = gameStateFromStore ?? initialGameState
  const hubConnectionScopeKey = `${gameId}|${authUserId?.trim().toLowerCase() ?? ''}`

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
    if (!authUserId) {
      setConnected(false)
      return
    }

    const nextConnection = createGameHubConnection()
    connectionRef.current = nextConnection

    let isDisposed = false
    let disposeInvalidationHandler = () => {}
    let disposeParticipantJoinedHandler = () => {}

    const handleReconnected = async (): Promise<void> => {
      if (isDisposed) {
        return
      }

      try {
        await subscribeToGame(nextConnection, gameId)
        if (isDisposed) {
          return
        }

        await refreshCurrentGameState(nextConnection)
        if (isDisposed) {
          return
        }

        setConnectionError(null)
        setConnected(nextConnection.state === HubConnectionState.Connected)
      } catch (error) {
        if (isDisposed) {
          return
        }

        const message = error instanceof Error ? error.message : 'Reconnected to the game hub, but resubscribing failed.'
        if (!isConnectionConnected(nextConnection)) {
          const snapshotResult = await refetchGameStateSnapshot()
          if (!isDisposed && snapshotResult.data && !isConnectionConnected(nextConnection)) {
            setGameState(snapshotResult.data)
          }
        }
        setConnectionError(message)
        setConnected(false)
      }
    }

    nextConnection.onreconnecting(() => {
      if (!isDisposed) {
        setConnected(false)
      }
    })
    nextConnection.onreconnected(handleReconnected)
    nextConnection.onclose(() => {
      if (!isDisposed) {
        setConnected(false)
      }
    })

    async function connectAndSubscribe(): Promise<void> {
      let lastError: unknown

      for (let attempt = 0; attempt < HUB_CONNECT_MAX_ATTEMPTS; attempt += 1) {
        if (isDisposed) {
          return
        }

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

          disposeParticipantJoinedHandler = onGameParticipantJoined(nextConnection, (updatedGameId) => {
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
          return
        } catch (error) {
          lastError = error

          if (isDisposed) {
            return
          }

          if (nextConnection.state === HubConnectionState.Connected) {
            return
          }

          if (attempt < HUB_CONNECT_MAX_ATTEMPTS - 1) {
            await new Promise<void>((resolve) => {
              window.setTimeout(resolve, HUB_CONNECT_RETRY_DELAY_MS)
            })
          }
        }
      }

      if (!isDisposed && !isConnectionConnected(nextConnection)) {
        const message = lastError instanceof Error ? lastError.message : 'Unable to connect to game hub.'
        const snapshotResult = await refetchGameStateSnapshot()
        if (!isDisposed && !isConnectionConnected(nextConnection)) {
          if (snapshotResult.data) {
            setGameState(snapshotResult.data)
          }
          setConnectionError(message)
          setConnected(false)
        }
      }
    }

    void connectAndSubscribe()

    return () => {
      isDisposed = true
      resetConnectionState()
      disposeInvalidationHandler()
      disposeParticipantJoinedHandler()
      connectionRef.current = null

      void (async () => {
        const settleDeadlineMs = Date.now() + 2_000
        while (nextConnection.state === HubConnectionState.Connecting && Date.now() < settleDeadlineMs) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 150)
          })
        }

        try {
          await unsubscribeFromGame(nextConnection, gameId)
        } catch {
          // Best effort only; disconnect follows immediately.
        }

        await disconnectGameHub(nextConnection)
      })()
    }
  }, [authUserId, gameId, hubConnectionScopeKey, refreshCurrentGameState, refetchGameStateSnapshot, resetConnectionState, setConnected, setConnectionError, setGameState])

  const submitHubIntent = useSubmitHubIntent({ connectionRef, gameState, authUserId, gameId })

  const getCardActionTargetsForRequest = useCallback(
    async (request: {
      actionId: string
      sourceCardInstanceId: string
      arguments?: Record<string, string>
    }) => {
      const currentConnection = connectionRef.current

      if (!currentConnection || currentConnection.state !== HubConnectionState.Connected) {
        setActionError('Game hub is not connected.')
        return null
      }

      if (!authUserId) {
        setActionError('You must be logged in to perform this action.')
        return null
      }

      try {
        const result = await getCardActionTargets(
          currentConnection,
          gameId,
          authUserId,
          request.actionId,
          request.sourceCardInstanceId,
          request.arguments,
        )

        if (!result.succeeded || !result.value) {
          setActionError(resolveGenericHubErrorMessage(result as IHubOperationResult<unknown>))
          return null
        }

        setActionError(null)
        return result.value as IGameCardActionTargetsResponse
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to fetch card action targets.'
        setActionError(message)
        return null
      }
    },
    [authUserId, gameId, setActionError],
  )

  const refreshGameState = useCallback(async (): Promise<boolean> => {
    const currentConnection = connectionRef.current
    if (!currentConnection || currentConnection.state !== HubConnectionState.Connected) {
      return false
    }

    await refreshCurrentGameState(currentConnection)
    return true
  }, [refreshCurrentGameState])

  return useMemo(
    () => ({
      gameState,
      isConnected,
      isActionPending,
      connectionError,
      actionError,
      submitHubIntent,
      getCardActionTargets: getCardActionTargetsForRequest,
      refreshGameState,
    }),
    [
      actionError,
      connectionError,
      gameState,
      getCardActionTargetsForRequest,
      isActionPending,
      isConnected,
      refreshGameState,
      submitHubIntent,
    ],
  )
}

export {
  useGameHubState,
}
