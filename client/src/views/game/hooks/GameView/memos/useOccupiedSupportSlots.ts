import { useMemo } from 'react'
import type { IDerivedGameViewState } from '@/views/game/types'

function useOccupiedSupportSlots({ derivedGameState }: {
    derivedGameState: IDerivedGameViewState
}) {
    const occupiedBottomSupportSlots = useMemo(() => {
        const occupied = new Set<number>()
        const supportCards = derivedGameState.currentPlayer?.supportZone ?? []
        for (const [currentIndex, supportCard] of supportCards.entries()) {
            if (typeof supportCard.supportSlotIndex === 'number') {
                occupied.add(supportCard.supportSlotIndex)
            } else {
                occupied.add(currentIndex)
            }
        }

        return occupied
    }, [derivedGameState.currentPlayer?.supportZone])

    return occupiedBottomSupportSlots
}

export { useOccupiedSupportSlots }