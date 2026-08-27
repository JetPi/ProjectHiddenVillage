import type { IGamePlayerStateResponse } from "@/services/api/gameApi"
import type { IGameActionOptionResponse } from "@/services/api/types/game"
import type { IGameCardActionExecutionRequest } from "@/services/api/types/gameHub"
import type { ISubmitHubIntentRequest } from "@/views/game/types/hub"
import type { IGameLoaderData } from "@/views/game/types/routeData"
import type { ICardPreloadPayload, IDerivedGameViewState } from "@/views/game/types/viewModels"
import { buildCardById, buildCardTypeById, resolveLeaderCard } from "@/views/game/utils/functions/cards"

function normalizePlayerId(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, '')
}

function resolveCurrentPlayer(
  players: IGamePlayerStateResponse[],
  userId: string | undefined,
): IGamePlayerStateResponse | null {
  if (players.length === 0) {
    return null
  }

  const normalizedCurrentUserId = normalizePlayerId(userId ?? '')
  if (!normalizedCurrentUserId) {
    return players[0]
  }

  return players.find((player) => normalizePlayerId(player.playerId) === normalizedCurrentUserId) ?? players[0]
}

function resolveOpponentPlayer(
  players: IGamePlayerStateResponse[],
  currentPlayer: IGamePlayerStateResponse | null,
): IGamePlayerStateResponse | null {
  if (!currentPlayer || players.length === 0) {
    return null
  }

  const normalizedCurrentPlayerId = normalizePlayerId(currentPlayer.playerId)
  return players.find((player) => normalizePlayerId(player.playerId) !== normalizedCurrentPlayerId) ?? null
}

function deriveGameViewState(
  gameCards: IGameLoaderData['gameCards'],
  players: IGamePlayerStateResponse[],
  userId: string | undefined,
): IDerivedGameViewState {
  const cardById = buildCardById(gameCards)
  const cardTypeById = buildCardTypeById(gameCards)
  const currentPlayer = resolveCurrentPlayer(players, userId)
  const opponentPlayer = resolveOpponentPlayer(players, currentPlayer)

  return {
    cardById,
    cardTypeById,
    currentPlayer,
    opponentPlayer,
    topLeaderCard: resolveLeaderCard(opponentPlayer, cardTypeById, cardById),
    bottomLeaderCard: resolveLeaderCard(currentPlayer, cardTypeById, cardById),
  }
}

function resolveSourceCardInstanceId(actionId: string): string | null {
  const delimiterIndex = actionId.indexOf(':')
  if (delimiterIndex < 0 || delimiterIndex === actionId.length - 1) {
    return null
  }

  return actionId.slice(delimiterIndex + 1)
}

function buildCardPreloadPayload(gameCards: IGameLoaderData['gameCards']): ICardPreloadPayload | null {
  const cardIds = Array.from(
    new Set(
      gameCards
        .map((card) => card.id.trim())
        .filter((cardId) => cardId.length > 0),
    ),
  )

  if (cardIds.length === 0) {
    return null
  }

  const signature = cardIds
    .map((cardId) => cardId.toLowerCase())
    .sort((left, right) => left.localeCompare(right))
    .join('|')

  return {
    cardIds,
    signature,
  }
}

export function mapActionToHubIntent(
  action: IGameActionOptionResponse,
  canResolvePrompt: boolean,
  selectedTargets?: IGameCardActionExecutionRequest['selectedTargets'],
  executionArguments?: IGameCardActionExecutionRequest['arguments'],
): ISubmitHubIntentRequest | null {
  if (action.actionId.startsWith('activate-support:')
    || action.actionId.startsWith('play-card:')
    || action.actionId.startsWith('summon-to-field:')
    || action.actionId.startsWith('battle-action:')) {
    const sourceCardInstanceId = resolveSourceCardInstanceId(action.actionId)
    if (!sourceCardInstanceId) {
      return null
    }

    return {
      intent: 'execute-card-action',
      actionId: action.actionId,
      sourceCardInstanceId,
      selectedTargets,
      arguments: executionArguments,
    }
  }

  if (action.actionId.startsWith('set-support:')) {
    const sourceCardInstanceId = resolveSourceCardInstanceId(action.actionId)
    const supportSlotIndex = executionArguments?.supportSlotIndex
    if (!sourceCardInstanceId || typeof supportSlotIndex !== 'string' || supportSlotIndex.trim().length === 0) {
      return null
    }

    return {
      intent: 'execute-card-action',
      actionId: action.actionId,
      sourceCardInstanceId,
      selectedTargets,
      arguments: {
        ...executionArguments,
        supportSlotIndex,
      },
    }
  }

  if (action.actionId.startsWith('resolve-prompt:')) {
    if (!canResolvePrompt) {
      return null
    }

    const selectedOption = action.actionId.slice('resolve-prompt:'.length)
    return {
      intent: 'resolve-prompt',
      selectedOption,
    }
  }

  if (action.actionId === 'declare-action') {
    return { intent: 'declare-action' }
  }

  if (action.actionId === 'pass-turn' || action.actionId === 'pass') {
    return { intent: 'pass-turn' }
  }

  if (action.actionId === 'advance-phase') {
    return { intent: 'advance-phase' }
  }

  if (action.actionId === 'declare-end-step' || action.actionId === 'endPhase' || action.actionId === 'turn-end') {
    return { intent: 'declare-end-step' }
  }

  if (action.actionId === 'declare-attack' || action.actionId === 'declareAttack') {
    return { intent: 'advance-phase' }
  }

  if (action.actionId === 'complete-end-step') {
    return { intent: 'complete-end-step' }
  }

  return null
}


export {
  normalizePlayerId,
  resolveCurrentPlayer,
  resolveOpponentPlayer,
  deriveGameViewState,
  buildCardPreloadPayload,
}