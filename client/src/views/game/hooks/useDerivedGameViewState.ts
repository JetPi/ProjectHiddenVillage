import { useMemo } from 'react'
import type { IGamePlayerStateResponse } from '../../../services/api/gameApi'
import type { IGameLoaderData } from '../types/routeData'
import type { IDerivedGameViewState } from '../types/viewModels'
import { deriveGameViewState } from '../utils/functions'

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