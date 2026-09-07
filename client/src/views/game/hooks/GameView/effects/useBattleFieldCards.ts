import type { IGameCardInstanceResponse, IGamePlayerStateResponse } from "@/services/api/types/game"
import { useEffect, useMemo } from "react"

function useBattlefieldCards(battlefieldDisplayOrder: string[], currentBattlefieldRawCards: IGameCardInstanceResponse[]) {
    return useMemo(() => {
        const baseCards = currentBattlefieldRawCards
        const knownIds = new Set(baseCards.map((card) => card.instanceId))
        const preservedIds = battlefieldDisplayOrder.filter((instanceId) => knownIds.has(instanceId))
        const preservedIdSet = new Set(preservedIds)
        const appendedIds = baseCards.map((card) => card.instanceId).filter((instanceId) => !preservedIdSet.has(instanceId))
        const orderedIds = [...preservedIds, ...appendedIds]
        const cardsById = new Map(baseCards.map((card) => [card.instanceId, card]))
        return orderedIds
            .map((instanceId) => cardsById.get(instanceId))
            .filter((card): card is typeof baseCards[number] => Boolean(card))
    }, [currentBattlefieldRawCards, battlefieldDisplayOrder])
}

function useBattlefieldCardReorderEffect(
    currentBattlefieldRawCards: IGameCardInstanceResponse[],
    setBattlefieldDisplayOrder: React.Dispatch<React.SetStateAction<string[]>>,
) {
    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setBattlefieldDisplayOrder((previousOrder) => {
                const knownIds = new Set(currentBattlefieldRawCards.map((card) => card.instanceId))
                const preservedIds = previousOrder.filter((instanceId) => knownIds.has(instanceId))
                const preservedIdSet = new Set(preservedIds)
                const appendedIds = currentBattlefieldRawCards
                    .map((card) => card.instanceId)
                    .filter((instanceId) => !preservedIdSet.has(instanceId))
                return [...preservedIds, ...appendedIds]
            })
        }, 0)

        return () => {
            window.clearTimeout(timeoutId)
        }
    }, [currentBattlefieldRawCards, setBattlefieldDisplayOrder])
}

function useCurrentBattlefieldRawCards(player: IGamePlayerStateResponse | null | undefined) {
    return useMemo(
        () => player?.characterField ?? [],
        [player?.characterField],
    )
}

export { useCurrentBattlefieldRawCards, useBattlefieldCards, useBattlefieldCardReorderEffect }