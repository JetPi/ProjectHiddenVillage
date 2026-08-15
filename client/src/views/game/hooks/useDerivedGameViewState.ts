import { useMemo } from 'react'
import type { IGamePlayerStateResponse } from '@/services/api/gameApi'
import type { IGameLoaderData } from '@/views/game/types/routeData'
import type { IDerivedGameViewState } from '@/views/game/types/viewModels'
import { deriveGameViewState } from '@/views/game/utils/functions/gameState'

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