import type { IGameActionOptionResponse, IGameCardInstanceResponse, IGamePlayerStateResponse } from "@/services/api/types/game"
import type { IGameLoaderData } from "@/views/game/types/routeData"
import type { IGameCard, ILeaderCardViewModel, INonLeaderCardViewModel } from "@/views/game/types/viewModels"

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

function resolveNonLeaderCards(
  cards: IGameCardInstanceResponse[],
  cardTypeById: ReadonlyMap<string, string>,
  cardById: ReadonlyMap<string, IGameCard>,
): INonLeaderCardViewModel[] {
  const resolvedCards: INonLeaderCardViewModel[] = []

  for (const card of cards) {
    const normalizedCardId = card.cardDefinitionId.trim().toLowerCase()
    if (!normalizedCardId || cardTypeById.get(normalizedCardId) === 'leader') {
      continue
    }

    const catalogCard = cardById.get(normalizedCardId)
    if (!catalogCard) {
      continue
    }

    resolvedCards.push({
      instanceId: card.instanceId,
      cardDefinitionId: card.cardDefinitionId,
      ownerPlayerId: card.ownerPlayerId,
      controllerPlayerId: card.controllerPlayerId,
      id: catalogCard.id,
      image: catalogCard.image,
      displayName: catalogCard.displayName,
      type: catalogCard.type,
      isExhausted: card.isExhausted,
    })
  }

  return resolvedCards
}

function resolveCardActionOptionsForInstanceId(
  availableActions: IGameActionOptionResponse[],
  cardInstanceId: string,
): IGameActionOptionResponse[] {
  const normalizedInstanceId = cardInstanceId.trim().toLowerCase()
  if (!normalizedInstanceId) {
    return []
  }

  return availableActions.filter((action) => {
    const normalizedActionId = action.actionId.trim().toLowerCase()
    return normalizedActionId.includes(normalizedInstanceId)
  })
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

export {
  resolveLeaderCard,
  buildCardById,
  buildCardTypeById,
  resolveNonLeaderCards,
  resolveCardActionOptionsForInstanceId,
}