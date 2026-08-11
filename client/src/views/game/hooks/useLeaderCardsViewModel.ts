import type { IGamePlayerStateResponse } from '../../../services/api/gameApi'
import type { IGameLoaderData } from '../types/routeData'
import type { ILeaderCardsViewModel } from '../types/hooks'
import { buildLeaderCardFrameClass } from '../utils/functions'
import { useDerivedGameViewState } from './useDerivedGameViewState'

function useLeaderCardsViewModel(
  gameCards: IGameLoaderData['gameCards'],
  players: IGamePlayerStateResponse[],
  userId: string | undefined,
  leaderCardFrameBaseClass: string,
): ILeaderCardsViewModel {
  const { topLeaderCard, bottomLeaderCard } = useDerivedGameViewState(gameCards, players, userId)

  return {
    topLeaderCard,
    bottomLeaderCard,
    topLeaderCardFrameClassName: buildLeaderCardFrameClass(leaderCardFrameBaseClass, Boolean(topLeaderCard)),
    bottomLeaderCardFrameClassName: buildLeaderCardFrameClass(leaderCardFrameBaseClass, Boolean(bottomLeaderCard)),
  }
}

export {
  useLeaderCardsViewModel,
}
