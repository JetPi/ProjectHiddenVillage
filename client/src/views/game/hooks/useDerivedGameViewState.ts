import { useMemo } from 'react'
import type { IGamePlayerStateResponse } from '@/services/api/gameApi'
import type { IDerivedGameViewState, IGameLoaderData  } from '@/views/game/types'
import { deriveGameViewState } from '@/views/game/utils/functions'

function useDerivedGameViewState(
  gameCards: IGameLoaderData['gameCards'],
  players: IGamePlayerStateResponse[],
  userId: string | undefined,
): IDerivedGameViewState {
  return useMemo(
    () => deriveGameViewState(gameCards, players, userId),
    [gameCards, players, userId],
  )
}

export {
  useDerivedGameViewState,
}