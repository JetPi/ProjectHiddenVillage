import type { IGameCardInstanceResponse } from "@/services/api/types/game"
import type { IUseGameHubStateResult } from "@/views/game/types/hub/hub"
import type { IDerivedGameViewState } from "@/views/game/types/hub/viewModels"
import { normalizePlayerId } from "@/views/game/utils/functions/gameState/gameViewFunctions"

function getIsMissingActiveMainPhaseOptions({
  gameHubState,
  derivedGameState,
  bottomHandCards,
  authUserId,
}: MissingActiveMainPhaseOptionsProps): boolean {
    const {
    gameState,
    isConnected,
    isActionPending,
  } = gameHubState
  
  const { bottomLeaderCard } = derivedGameState
  const hasPendingPromptFlag = Boolean(gameState.pendingPrompt)
  const isActionPendingFlag = isActionPending

  return Boolean(authUserId)
    && isConnected
    && !isActionPendingFlag
    && !hasPendingPromptFlag
    && gameState.phase === 'MainPhase'
    && normalizePlayerId(gameState.activePlayerId) === normalizePlayerId(authUserId!)
    && bottomHandCards.length > 0
    && bottomHandCards.every((card) => (card.availableActions ?? []).length === 0)
    && !(bottomLeaderCard?.availableActions && bottomLeaderCard.availableActions.length > 0)
}

interface MissingActiveMainPhaseOptionsProps {
  gameHubState: IUseGameHubStateResult
  derivedGameState: IDerivedGameViewState,
  bottomHandCards: IGameCardInstanceResponse[],
  authUserId: string | undefined
}

export { getIsMissingActiveMainPhaseOptions }