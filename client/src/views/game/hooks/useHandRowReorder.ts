import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { IHandReorderCard } from '@/views/game/types'


function reconcileOrder(order: string[], cards: IHandReorderCard[]): string[] {
  const knownIds = new Set(cards.map((card) => card.instanceId))
  const preservedOrder = order.filter((instanceId) => knownIds.has(instanceId))
  const knownOrderedIds = new Set(preservedOrder)
  const appendedIds = cards
    .map((card) => card.instanceId)
    .filter((instanceId) => !knownOrderedIds.has(instanceId))

  return [...preservedOrder, ...appendedIds]
}

type IUseHandRowReorderArgs<TCard extends IHandReorderCard> = {
  cards: TCard[]
  canDragCard?: (card: TCard) => boolean
}

function useHandRowReorder<TCard extends IHandReorderCard>({
  cards,
  canDragCard,
}: IUseHandRowReorderArgs<TCard>) {
  const [displayOrder, setDisplayOrder] = useState<string[]>(() => cards.map((card) => card.instanceId))
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null)
  const suppressNextClickRef = useRef(false)

  const orderedIds = useMemo(() => reconcileOrder(displayOrder, cards), [cards, displayOrder])
  const orderedCards = useMemo(() => {
    const cardById = new Map(cards.map((card) => [card.instanceId, card]))
    return orderedIds
      .map((instanceId) => cardById.get(instanceId))
      .filter((card): card is TCard => Boolean(card))
  }, [cards, orderedIds])

  const handleReorder = useCallback((nextValues: string[]) => {
    setDisplayOrder(reconcileOrder(nextValues, cards))
  }, [cards])

  const handleDragStateChange = useCallback((instanceId: string | null) => {
    setActiveInstanceId(instanceId)
    if (instanceId !== null) {
      return
    }

    suppressNextClickRef.current = true
    window.setTimeout(() => {
      suppressNextClickRef.current = false
    }, 0)
  }, [])

  useEffect(() => {
    function handleWindowClickCapture(event: MouseEvent): void {
      if (event.detail === 0) {
        return
      }

      if (!suppressNextClickRef.current) {
        return
      }

      suppressNextClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
    }

    window.addEventListener('click', handleWindowClickCapture, true)
    return () => {
      window.removeEventListener('click', handleWindowClickCapture, true)
    }
  }, [])

  const isReorderDragging = activeInstanceId !== null
  const isDraggableCard = useCallback((card: TCard) => {
    if (cards.length <= 1) {
      return false
    }

    return canDragCard ? canDragCard(card) : true
  }, [canDragCard, cards.length])

  return {
    orderedCards,
    orderedIds,
    activeInstanceId,
    isReorderDragging,
    isDraggableCard,
    handleReorder,
    handleDragStateChange,
  }
}

export { useHandRowReorder }
