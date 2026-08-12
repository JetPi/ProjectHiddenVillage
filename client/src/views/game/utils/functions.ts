import type { IGamePlayerStateResponse } from '../../../services/api/gameApi'
import type { IGameLoaderData } from '../types/routeData'
import type { ICardPreloadPayload, IDerivedGameViewState, IGameCard, ILeaderCardViewModel } from '../types/viewModels'

function normalizePlayerId(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, '')
}

function resolveLeaderCardId(
  player: IGamePlayerStateResponse | null,
  cardTypeById: ReadonlyMap<string, string>,
): string | null {
  if (!player) {
    return null
  }

  if (player.leader?.cardDefinitionId) {
    return player.leader.cardDefinitionId
  }

  const fromCharacterField = player.characterField.find((card) => {
    const normalizedCardId = card.cardDefinitionId.trim().toLowerCase()
    return cardTypeById.get(normalizedCardId) === 'leader'
  })

  if (fromCharacterField?.cardDefinitionId) {
    return fromCharacterField.cardDefinitionId
  }

  const fromDeck = player.deck.find((card) => {
    const normalizedCardId = card.cardDefinitionId.trim().toLowerCase()
    return cardTypeById.get(normalizedCardId) === 'leader'
  })

  return fromDeck?.cardDefinitionId ?? null
}

function buildCardById(cards: IGameLoaderData['gameCards']): Map<string, IGameLoaderData['gameCards'][number]> {
  const nextMap = new Map<string, IGameLoaderData['gameCards'][number]>()

  for (const card of cards) {
    const normalizedCardId = card.id.trim().toLowerCase()
    if (!normalizedCardId || nextMap.has(normalizedCardId)) {
      continue
    }

    nextMap.set(normalizedCardId, card)
  }

  return nextMap
}

function buildCardTypeById(cards: IGameLoaderData['gameCards']): Map<string, string> {
  const nextMap = new Map<string, string>()

  for (const card of cards) {
    const normalizedCardId = card.id.trim().toLowerCase()
    const normalizedType = card.type.trim().toLowerCase()

    if (!normalizedCardId || !normalizedType || nextMap.has(normalizedCardId)) {
      continue
    }

    nextMap.set(normalizedCardId, normalizedType)
  }

  return nextMap
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

function resolveLeaderCard(
  player: IGamePlayerStateResponse | null,
  cardTypeById: ReadonlyMap<string, string>,
  cardById: ReadonlyMap<string, IGameCard>,
): ILeaderCardViewModel | null {
  const leaderCardId = resolveLeaderCardId(player, cardTypeById)
  if (!leaderCardId) {
    return null
  }

  const catalogCard = cardById.get(leaderCardId.trim().toLowerCase())
  if (!catalogCard) {
    return null
  }

  const life = catalogCard.life ?? null
  const currentLife = player?.leader?.currentLife ?? life
  const leaderId = catalogCard.id ?? leaderCardId

  return {
    instanceId: player?.leader?.instanceId ?? '',
    cardDefinitionId: player?.leader?.cardDefinitionId ?? leaderId,
    ownerPlayerId: player?.leader?.ownerPlayerId ?? player?.playerId ?? '',
    controllerPlayerId: player?.leader?.controllerPlayerId ?? player?.playerId ?? '',
    id: leaderId,
    image: catalogCard.image,
    attribute: catalogCard.attribute ?? null,
    name: catalogCard.name,
    displayName: catalogCard.displayName,
    type: catalogCard.type,
    traits: catalogCard.traits,
    color: catalogCard.color,
    description: catalogCard.description,
    damage: catalogCard.damage,
    power: catalogCard.power,
    life,
    currentLife,
    recoveryEffect: player?.leader?.recoveryEffect ?? '',
  }
}

function buildLeaderCardFrameClass(baseClassName: string, hasCard: boolean): string {
  return `${baseClassName} ${hasCard ? 'border-transparent' : ''}`.trim()
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

export {
  normalizePlayerId,
  resolveLeaderCardId,
  buildCardById,
  buildCardTypeById,
  resolveCurrentPlayer,
  resolveOpponentPlayer,
  resolveLeaderCard,
  buildLeaderCardFrameClass,
  deriveGameViewState,
  buildCardPreloadPayload,
}