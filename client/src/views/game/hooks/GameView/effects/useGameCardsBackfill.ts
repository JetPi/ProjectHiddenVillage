import { useEffect, useRef } from 'react'
import type { IGamePlayerStateResponse } from '@/services/api/gameApi'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

function useGameCardsBackfill({
  players,
  liveGameCards,
  gameCardsQuery,
}: IGameCardsBackfillArgs) {
  const { isFetching, refetch } = gameCardsQuery
  const lastRequestedMissingCardIdsKeyRef = useRef('')

  useEffect(() => {
    const knownCardIds = new Set(liveGameCards.map((card) => card.id.trim().toLowerCase()))
    const referencedCardIds = new Set<string>()

    for (const player of players) {
      const leaderCardDefinitionId = player.leader?.cardDefinitionId?.trim().toLowerCase()
      if (leaderCardDefinitionId) {
        referencedCardIds.add(leaderCardDefinitionId)
      }

      const allCardInstances = [
        ...player.deck,
        ...player.hand,
        ...player.characterField,
        ...player.supportZone,
        ...player.trash,
        ...player.exileZone,
      ]

      for (const cardInstance of allCardInstances) {
        const normalizedCardId = cardInstance.cardDefinitionId.trim().toLowerCase()
        if (normalizedCardId) {
          referencedCardIds.add(normalizedCardId)
        }
      }
    }

    const missingCardIds = [...referencedCardIds]
      .filter((cardId) => !knownCardIds.has(cardId))
      .sort()

    if (missingCardIds.length === 0) {
      lastRequestedMissingCardIdsKeyRef.current = ''
      return
    }

    const missingCardIdsKey = missingCardIds.join('|')
    if (missingCardIdsKey === lastRequestedMissingCardIdsKeyRef.current || isFetching) {
      return
    }

    lastRequestedMissingCardIdsKeyRef.current = missingCardIdsKey
    void refetch()
  }, [isFetching, liveGameCards, players, refetch])
}

type IGameCardsBackfillArgs = {
  players: IGamePlayerStateResponse[]
  liveGameCards: ICardCatalogItemResponse[]
  gameCardsQuery: {
    isFetching: boolean
    refetch: () => Promise<unknown>
  }
}

export { useGameCardsBackfill }
