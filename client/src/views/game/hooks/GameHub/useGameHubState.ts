import { useCallback, useEffect, useMemo, useRef } from 'react'
import { HubConnection, HubConnectionState } from '@microsoft/signalr'
import i18n from '@/i18n'
import {
  acknowledgePhasePresentation as acknowledgePhasePresentationOnHub,
  connectGameHub,
  createGameHubConnection,
  disconnectGameHub,
  forfeitGame as forfeitGameOnHub,
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

// The initial handshake used to give up after three 600 ms attempts. A `dotnet watch` rebuild or a deploy
// outlasts that, and the board was then stranded behind disabled prompt buttons with no way back short of a
// page reload. Retries now continue with a capped backoff until the connection is up or the view unmounts.
const HUB_CONNECT_BASE_DELAY_MS = 500
const HUB_CONNECT_MAX_DELAY_MS = 10_000
const ACTION_PENDING_WATCHDOG_MS = 15_000

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
  const refreshInFlightRef = useRef(false)
  const refreshQueuedRef = useRef(false)
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
  const setActionPending = useGameHubStore((state) => state.setActionPending)
  const resetConnectionState = useGameHubStore((state) => state.resetConnectionState)
  const { refetch: refetchGameStateSnapshot } = useGameStateQuery(gameId, { enabled: false })

  const gameState = gameStateFromStore ?? initialGameState
  const hubConnectionScopeKey = `${gameId}|${authUserId?.trim().toLowerCase() ?? ''}`

  useEffect(() => {
    initializeGameSession(gameId, initialGameState)
  }, [gameId, initialGameState, initializeGameSession])

  const refreshCurrentGameState = useCallback(
    async (currentConnection: HubConnection): Promise<boolean> => {
      const result = await getCurrentGameState(currentConnection, gameId)
      if (!result.succeeded || !result.value) {
        setConnectionError(resolveHubErrorMessage(result))
        return false
      }

      setConnectionError(null)
      setGameState(result.value)
      return true
    },
    [gameId, setConnectionError, setGameState],
  )

  const requestGameStateRefresh = useCallback(
    (currentConnection: HubConnection): void => {
      if (refreshInFlightRef.current) {
        refreshQueuedRef.current = true
        return
      }

      refreshInFlightRef.current = true
      void (async () => {
        try {
          do {
            refreshQueuedRef.current = false
            await refreshCurrentGameState(currentConnection)
          } while (refreshQueuedRef.current)
        } finally {
          refreshInFlightRef.current = false
        }
      })()
    },
    [refreshCurrentGameState],
  )

  const acknowledgePhasePresentation = useCallback(
    async (presentationId: string): Promise<boolean> => {
      const currentConnection = connectionRef.current
      if (!currentConnection || !isConnectionConnected(currentConnection)) {
        return false
      }

      try {
        const result = await acknowledgePhasePresentationOnHub(currentConnection, gameId, presentationId)
        if (!result.succeeded || !result.value) {
          console.warn('[GameHub] phase presentation acknowledgement refused.', {
            gameId,
            presentationId,
            errorCode: result.errorCode,
            errorDescription: result.errorDescription,
          })
          requestGameStateRefresh(currentConnection)
          return false
        }

        setGameState(result.value)
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Phase presentation acknowledgement failed.'
        console.warn('[GameHub] phase presentation acknowledgement threw.', {
          gameId,
          presentationId,
          message,
        })
        requestGameStateRefresh(currentConnection)
        return false
      }
    },
    [gameId, requestGameStateRefresh, setGameState],
  )

  /**
   * Resigns. It deliberately does not go through `submitHubIntent`: it is not a game action, so it must not be
   * blocked by the HUD's action gate, and the state the engine returns is already the result overlay's payload.
   */
  const forfeitGame = useCallback(
    async (): Promise<boolean> => {
      const currentConnection = connectionRef.current
      if (!currentConnection || !isConnectionConnected(currentConnection)) {
        return false
      }

      try {
        const result = await forfeitGameOnHub(currentConnection, gameId)
        if (!result.succeeded || !result.value) {
          console.warn('[GameHub] forfeit was refused.', {
            gameId,
            errorCode: result.errorCode,
            errorDescription: result.errorDescription,
          })
          requestGameStateRefresh(currentConnection)
          return false
        }

        setGameState(result.value)
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Forfeit failed.'
        console.warn('[GameHub] forfeit threw.', { gameId, message })
        requestGameStateRefresh(currentConnection)
        return false
      }
    },
    [gameId, requestGameStateRefresh, setGameState],
  )

  useEffect(() => {
    if (!authUserId) {
      setConnected(false)
      return
    }

    const nextConnection = createGameHubConnection()
    connectionRef.current = nextConnection

    let isDisposed = false
    let isConnecting = false
    let retryTimeoutId: number | null = null
    let retryAttempt = 0
    let hasFetchedFallbackSnapshot = false

    // Registered once per connection, never inside the retry loop: `connection.on` appends handlers, so
    // re-registering them on every attempt would multiply the refresh callbacks.
    const disposeInvalidationHandler = onGameStateInvalidated(nextConnection, (updatedGameId) => {
      if (updatedGameId.trim().toLowerCase() !== gameId.trim().toLowerCase()) {
        return
      }

      requestGameStateRefresh(nextConnection)
    })

    const disposeParticipantJoinedHandler = onGameParticipantJoined(nextConnection, (updatedGameId) => {
      if (updatedGameId.trim().toLowerCase() !== gameId.trim().toLowerCase()) {
        return
      }

      requestGameStateRefresh(nextConnection)
    })

    const handleReconnected = async (): Promise<void> => {
      if (isDisposed) {
        return
      }

      try {
        await subscribeToGame(nextConnection, gameId)
        if (isDisposed) {
          return
        }

        requestGameStateRefresh(nextConnection)
        if (isDisposed) {
          return
        }

        retryAttempt = 0
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
      if (isDisposed) {
        return
      }

      setConnected(false)
      // `withAutomaticReconnect` has already exhausted its own policy by the time onclose fires, so this is
      // the last chance to keep the board alive: restart the connect loop from the top of the backoff.
      retryAttempt = 0
      scheduleRetry()
    })

    function scheduleRetry(): void {
      if (isDisposed || retryTimeoutId !== null) {
        return
      }

      const delayMs = Math.min(HUB_CONNECT_BASE_DELAY_MS * 2 ** retryAttempt, HUB_CONNECT_MAX_DELAY_MS)
      retryAttempt += 1
      retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null
        void connectAndSubscribe()
      }, delayMs)
    }

    async function connectAndSubscribe(): Promise<void> {
      if (isDisposed || isConnecting) {
        return
      }

      isConnecting = true

      try {
        await connectGameHub(nextConnection)
        if (isDisposed) {
          return
        }

        await subscribeToGame(nextConnection, gameId)
        if (isDisposed) {
          return
        }

        const refreshed = await refreshCurrentGameState(nextConnection)
        if (isDisposed) {
          return
        }

        retryAttempt = 0
        setConnected(nextConnection.state === HubConnectionState.Connected)

        // The socket is up but the game itself refused: most often the API restarted and dropped the
        // in-memory game. That is not a transient network condition, so do not loop on it - tell the player
        // instead of leaving a board that silently never updates.
        if (!refreshed) {
          setActionError('The game could not be loaded. It may no longer exist on the server.')
          return
        }

        setConnectionError(null)
      } catch (error) {
        if (isDisposed) {
          return
        }

        setConnectionError(error instanceof Error ? error.message : 'Unable to connect to game hub.')

        if (!isConnectionConnected(nextConnection)) {
          setConnected(false)

          // One snapshot keeps real cards on the board while the hub is down; the retry loop is what brings the
          // connection itself back, so this must never be the end of the road.
          if (!hasFetchedFallbackSnapshot) {
            hasFetchedFallbackSnapshot = true
            const snapshotResult = await refetchGameStateSnapshot()
            if (!isDisposed && snapshotResult.data && !isConnectionConnected(nextConnection)) {
              setGameState(snapshotResult.data)
            }
          }

          scheduleRetry()
        }
      } finally {
        isConnecting = false
      }
    }

    void connectAndSubscribe()

    return () => {
      isDisposed = true
      if (retryTimeoutId !== null) {
        window.clearTimeout(retryTimeoutId)
        retryTimeoutId = null
      }
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

        await unsubscribeFromGame(nextConnection, gameId).catch(() => undefined)

        await disconnectGameHub(nextConnection)
      })()
    }
  }, [authUserId, gameId, hubConnectionScopeKey, refreshCurrentGameState, refetchGameStateSnapshot, requestGameStateRefresh, resetConnectionState, setActionError, setConnected, setConnectionError, setGameState])

  useEffect(() => {
    if (!isActionPending) {
      return
    }

    const watchdogTimeoutId = window.setTimeout(() => {
      const currentState = useGameHubStore.getState()
      if (!currentState.isActionPending) {
        return
      }

      setActionError('The last action did not complete. Re-synced with the server.')
      setActionPending(false)

      const currentConnection = connectionRef.current
      if (currentConnection && isConnectionConnected(currentConnection)) {
        requestGameStateRefresh(currentConnection)
      }
    }, ACTION_PENDING_WATCHDOG_MS)

    return () => window.clearTimeout(watchdogTimeoutId)
  }, [isActionPending, requestGameStateRefresh, setActionError, setActionPending])

  const submitHubIntent = useSubmitHubIntent({ connectionRef, gameState, authUserId, gameId, requestGameStateRefresh })

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
        const message = error instanceof Error ? error.message : i18n.t('game.errors.fetchCardActionTargets')
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
      acknowledgePhasePresentation,
      forfeitGame,
      getCardActionTargets: getCardActionTargetsForRequest,
      refreshGameState,
    }),
    [
      acknowledgePhasePresentation,
      actionError,
      connectionError,
      forfeitGame,
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
