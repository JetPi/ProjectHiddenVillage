import type { IGamePlayerStateResponse } from '@/services/api/gameApi'
import type { IGameLoaderData } from '@/views/game/types/routeData'
import type { ILeaderCardsViewModel } from '@/views/game/types/hooks'
import { buildLeaderCardFrameClass } from '@/views/game/utils/functions'
import { useDerivedGameViewState } from '@/views/game/hooks/useDerivedGameViewState'

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
