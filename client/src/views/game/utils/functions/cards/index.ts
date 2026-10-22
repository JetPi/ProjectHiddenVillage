import type { IGameActionOptionResponse, IGameCardInstanceResponse, IGamePlayerStateResponse } from "@/services/api/types/game"
import type { ICardListOverlayEntry } from '@/components/ui/types'
import type { IGameLoaderData, IGameCard, ILeaderCardViewModel, INonLeaderCardViewModel } from "@/views/game/types"
import { CARD_ART_WIDTHS, resolveCardArtUrl } from '@/services/api/cardArt'

function buildCardListEntries(
  cards: IGameCardInstanceResponse[],
  cardById: ReadonlyMap<string, IGameCard>,
): ICardListOverlayEntry[] {
  const entries: ICardListOverlayEntry[] = []

  for (const card of cards) {
    const catalogCard = cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null

    entries.push({
      instanceId: card.instanceId,
      displayName: catalogCard?.displayName ?? card.cardDefinitionId,
      card: catalogCard,
    })
  }

  return entries
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
    isRested: player?.leader?.isRested ?? false,
    isExhausted: player?.leader?.isExhausted ?? false,
    id: leaderId,
    image: resolveCardArtUrl(catalogCard, CARD_ART_WIDTHS.board),
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
    currentPower: player?.leader?.power ?? catalogCard.power ?? 0,
    currentDamage: player?.leader?.damage ?? catalogCard.damage ?? 0,
    recoveryEffect: player?.leader?.recoveryEffect ?? '',
    availableActions: player?.leader?.availableActions,
    statusEffects: player?.leader?.statusEffects ?? [],
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
      image: resolveCardArtUrl(catalogCard, CARD_ART_WIDTHS.board),
      displayName: catalogCard.displayName,
      type: catalogCard.type,
      isFaceUp: card.isFaceUp,
      isConcealedFromOpponent: card.isConcealedFromOpponent,
      isRevealed: card.isRevealed === true,
      isExhausted: card.isExhausted,
      availableActions: card.availableActions,
      statusEffects: card.statusEffects ?? [],
      isRested: card.isRested,
      supportSlotIndex: card.supportSlotIndex,
      currentPower: card.power ?? catalogCard.power ?? 0,
      currentHealth: card.health ?? catalogCard.health ?? catalogCard.life ?? 0,
      currentDamage: card.damage ?? catalogCard.damage ?? 0,
    })
  }

  return resolvedCards
}

function resolveCardActionOptionsForInstanceId(
  availableActions: IGameActionOptionResponse[],
  cardInstanceId: string,
  cardAvailableActions?: IGameActionOptionResponse[],
): IGameActionOptionResponse[] {
  if (cardAvailableActions && cardAvailableActions.length > 0) {
    return cardAvailableActions
  }

  const normalizedInstanceId = cardInstanceId.trim().toLowerCase()
  if (!normalizedInstanceId) {
    return []
  }

  return availableActions.filter((action) => {
    const normalizedActionId = action.actionId.trim().toLowerCase()
    return normalizedActionId.includes(normalizedInstanceId)
  })
}

function isBattleActionOption(action: IGameActionOptionResponse): boolean {
  if (action.actionId.startsWith('battle-action:')) {
    return true
  }

  return action.label.trim().toLowerCase() === 'battle'
}

/**
 * The chips the board actually renders. A Battle option the engine published as unusable stays in the
 * payload - the engine probe and the e2e specs read its reason - but it never reaches the board as a
 * greyed-out button: the card's status badges explain why the card cannot attack instead.
 */
function filterVisibleCardActions(
  actionOptions: IGameActionOptionResponse[],
): IGameActionOptionResponse[] {
  return actionOptions.filter((action) => !(isBattleActionOption(action) && !action.isEnabled))
}

/**
 * The reason a disabled Battle option carries, used as the tooltip of the "cannot attack" status badge.
 * Null when Battle is either usable or absent (for example on the opponent's cards, which publish no actions).
 */
function resolveBattleRestrictionReason(
  actionOptions: IGameActionOptionResponse[],
): string | null {
  const disabledBattleAction = actionOptions.find(
    (action) => isBattleActionOption(action) && !action.isEnabled,
  )

  return disabledBattleAction?.disabledReason ?? null
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
  buildCardListEntries,
  resolveNonLeaderCards,
  resolveCardActionOptionsForInstanceId,
  isBattleActionOption,
  filterVisibleCardActions,
  resolveBattleRestrictionReason,
}