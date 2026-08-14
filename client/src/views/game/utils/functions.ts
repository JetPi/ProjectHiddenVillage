import type { IGameCardInstanceResponse, IGamePlayerStateResponse } from '../../../services/api/gameApi'
import type { IGameActionOptionResponse } from '../../../services/api/types/game'
import type { IDeckToHandAnimationArgs, IHandToPileAnimationArgs } from '../types/animations'
import type { ISubmitHubIntentRequest } from '../types/hub'
import type { IGameLoaderData } from '../types/routeData'
import type {
  ICardPreloadPayload,
  IDerivedGameViewState,
  IGameCard,
  ILeaderCardViewModel,
  INonLeaderCardViewModel,
} from '../types/viewModels'

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
  resolveNonLeaderCards,
  resolveCardActionOptionsForInstanceId,
  buildLeaderCardFrameClass,
  deriveGameViewState,
  buildCardPreloadPayload,
}

export function mapActionToHubIntent(
  action: IGameActionOptionResponse,
  canResolvePrompt: boolean,
): ISubmitHubIntentRequest | null {
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

export function runHandToPileAnimation({
  side,
  destination,
  cardInstanceId,
  topDeckCardRef,
  bottomDeckCardRef,
  topTrashCardRef,
  bottomTrashCardRef,
  topHandRowRef,
  bottomHandRowRef,
}: IHandToPileAnimationArgs): void {
  const sourceHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current
  const destinationPileElement = destination === 'deck'
    ? side === 'top'
      ? topDeckCardRef.current
      : bottomDeckCardRef.current
    : side === 'top'
      ? topTrashCardRef.current
      : bottomTrashCardRef.current

  if (!sourceHandRowElement || !destinationPileElement) {
    return
  }

  const sourceCardElement = sourceHandRowElement.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  )
  if (!sourceCardElement) {
    return
  }

  const sourceRect = sourceCardElement.getBoundingClientRect()
  const destinationRect = destinationPileElement.getBoundingClientRect()

  if (sourceRect.width <= 0 || sourceRect.height <= 0 || destinationRect.width <= 0 || destinationRect.height <= 0) {
    return
  }

  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2
  const destinationCenterX = destinationRect.left + destinationRect.width / 2
  const destinationCenterY = destinationRect.top + destinationRect.height / 2
  const translateX = destinationCenterX - sourceCenterX
  const translateY = destinationCenterY - sourceCenterY

  const movingCardElement = sourceCardElement.cloneNode(true) as HTMLDivElement
  movingCardElement.style.position = 'fixed'
  movingCardElement.style.left = `${sourceCenterX}px`
  movingCardElement.style.top = `${sourceCenterY}px`
  movingCardElement.style.width = `${sourceRect.width}px`
  movingCardElement.style.height = `${sourceRect.height}px`
  movingCardElement.style.margin = '0'
  movingCardElement.style.pointerEvents = 'none'
  movingCardElement.style.zIndex = '220'
  movingCardElement.style.transform = 'translate(-50%, -50%)'
  movingCardElement.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'

  document.body.appendChild(movingCardElement)

  const animation = movingCardElement.animate(
    [
      {
        transform: 'translate(-50%, -50%) translate(0px, 0px) scale(1)',
        opacity: 0.98,
      },
      {
        transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(0.9)`,
        opacity: 0.92,
      },
    ],
    {
      duration: 340,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  )

  animation.onfinish = () => {
    movingCardElement.remove()
  }

  animation.oncancel = () => {
    movingCardElement.remove()
  }
}

export async function waitMillis(durationMs: number): Promise<void> {
  if (durationMs <= 0) {
    return
  }

  await new Promise<void>((resolve) => {
    window.setTimeout(() => {
      resolve()
    }, durationMs)
  })
}

export function runDeckToHandAnimation({
  side,
  cardInstanceId,
  topDeckCardRef,
  bottomDeckCardRef,
  topHandRowRef,
  bottomHandRowRef,
}: IDeckToHandAnimationArgs): void {
  const sourceDeckElement = side === 'top' ? topDeckCardRef.current : bottomDeckCardRef.current
  const destinationHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current

  if (!sourceDeckElement || !destinationHandRowElement) {
    return
  }

  const destinationCardElement = destinationHandRowElement.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${cardInstanceId}"]`,
  )
  const sourceRect = sourceDeckElement.getBoundingClientRect()
  const destinationRect = (destinationCardElement ?? destinationHandRowElement).getBoundingClientRect()

  if (sourceRect.width <= 0 || sourceRect.height <= 0 || destinationRect.width <= 0 || destinationRect.height <= 0) {
    return
  }

  const sourceCenterX = sourceRect.left + sourceRect.width / 2
  const sourceCenterY = sourceRect.top + sourceRect.height / 2
  const destinationCenterX = destinationRect.left + destinationRect.width / 2
  const destinationCenterY = destinationRect.top + destinationRect.height / 2
  const translateX = destinationCenterX - sourceCenterX
  const translateY = destinationCenterY - sourceCenterY

  const movingCardElement = sourceDeckElement.cloneNode(true) as HTMLDivElement
  movingCardElement.style.position = 'fixed'
  movingCardElement.style.left = `${sourceCenterX}px`
  movingCardElement.style.top = `${sourceCenterY}px`
  movingCardElement.style.width = `${sourceRect.width}px`
  movingCardElement.style.height = `${sourceRect.height}px`
  movingCardElement.style.margin = '0'
  movingCardElement.style.pointerEvents = 'none'
  movingCardElement.style.zIndex = '220'
  movingCardElement.style.transform = 'translate(-50%, -50%)'
  movingCardElement.style.filter = 'drop-shadow(0 8px 18px rgba(0, 0, 0, 0.45))'

  document.body.appendChild(movingCardElement)

  const animation = movingCardElement.animate(
    [
      {
        transform: 'translate(-50%, -50%) translate(0px, 0px) scale(1)',
        opacity: 0.97,
      },
      {
        transform: `translate(-50%, -50%) translate(${translateX}px, ${translateY}px) scale(0.92)`,
        opacity: 0.99,
      },
    ],
    {
      duration: 420,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    },
  )

  animation.onfinish = () => {
    movingCardElement.remove()
  }

  animation.oncancel = () => {
    movingCardElement.remove()
  }
}
