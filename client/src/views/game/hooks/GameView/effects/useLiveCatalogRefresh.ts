import { fetchGameCards } from "@/services/api/gameApi"
import type { IGamePlayerStateResponse } from "@/services/api/types/game"
import type { ICardCatalogItemResponse } from "@/types/cardCatalog"
import { useEffect, type RefObject, type SetStateAction } from "react"
import type { IGameLoaderData } from "@/views/game/types"

export function useLiveCatalogRefresh(props: IBattlefieldDisplayProps, ) {
    const { setLiveGameCards, liveGameCards, players, joinCode, lastRequestedMissingCardIdsKeyRef, isCardCatalogRefreshInFlightRef } = props

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
        if (lastRequestedMissingCardIdsKeyRef.current === missingCardIdsKey || isCardCatalogRefreshInFlightRef.current) {
          return
        }
    
        let cancelled = false
        isCardCatalogRefreshInFlightRef.current = true
        lastRequestedMissingCardIdsKeyRef.current = missingCardIdsKey
    
        void fetchGameCards(joinCode)
          .then((freshCards) => {
            if (cancelled) {
              return
            }
    
            setLiveGameCards((previousCards) => {
              const mergedById = new Map<string, IGameLoaderData['gameCards'][number]>()
    
              for (const card of previousCards) {
                const normalizedCardId = card.id.trim().toLowerCase()
                if (!normalizedCardId) {
                  continue
                }
    
                mergedById.set(normalizedCardId, card)
              }
    
              for (const card of freshCards) {
                const normalizedCardId = card.id.trim().toLowerCase()
                if (!normalizedCardId) {
                  continue
                }
    
                mergedById.set(normalizedCardId, card)
              }
    
              return Array.from(mergedById.values())
            })
          })
          .catch(() => {
            // Live catalog refresh is best effort and must not block gameplay rendering.
          })
          .finally(() => {
            isCardCatalogRefreshInFlightRef.current = false
          })
    
        return () => {
          cancelled = true
        }
      }, [joinCode, liveGameCards, players, setLiveGameCards, lastRequestedMissingCardIdsKeyRef, isCardCatalogRefreshInFlightRef])
}

export interface IBattlefieldDisplayProps {
    joinCode: string,
    liveGameCards: ICardCatalogItemResponse[]
    players: IGamePlayerStateResponse[], 
    lastRequestedMissingCardIdsKeyRef: RefObject<string>
    isCardCatalogRefreshInFlightRef: RefObject<boolean>,
    setLiveGameCards: (value: SetStateAction<ICardCatalogItemResponse[]>) => void
}