import { useCallback, useEffect, useRef } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { CardBack, CardImage, FlippableCard } from '@/components/ui/cards'
import { GameHandRow } from './GameHandRow'
import { NonLeaderCardOverlay } from './NonLeaderCardOverlay'
import { useLongPressHandReorder } from '@/views/game/hooks/useLongPressHandReorder'
import { resolveCardActionOptionsForInstanceId } from '@/views/game/utils/functions'
import { CARD_ART_WIDTHS, resolveCardArtUrl } from '@/services/api/cardArt'
import type { IBottomHandReorderRowProps } from '@/views/game/types'

export function BottomHandReorderRow({
  cards,
  rowRef,
  cardById,
  availableActions,
  faceUpByInstanceId,
  showNoActionsMessage,
  isConnected,
  isActionPending,
  onSelectCardActionOption,
}: IBottomHandReorderRowProps) {
  const internalRowRef = useRef<HTMLDivElement | null>(null)
  const [autoAnimateRef, setAutoAnimateEnabled] = useAutoAnimate({ duration: 220, easing: 'ease-out' })

  const handleRowMount = useCallback((node: HTMLDivElement | null) => {
    internalRowRef.current = node
    autoAnimateRef(node)
    rowRef(node)
  }, [autoAnimateRef, rowRef])

  const {
    orderedCards,
    activeDraggedInstanceId,
    isReorderDragging,
    getCardPointerHandlers,
  } = useLongPressHandReorder({
    cards,
    rowRef: internalRowRef,
  })

  useEffect(() => {
    setAutoAnimateEnabled(!isReorderDragging)
  }, [isReorderDragging, setAutoAnimateEnabled])

  return (
    <GameHandRow
      cards={orderedCards}
      rowRef={handleRowMount}
      rowTestId="bottom-hand-row"
      rowClassName="overflow-visible"
      renderCard={(card) => {
        const previewCard = cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null
        const cardActionOptions = resolveCardActionOptionsForInstanceId(
          availableActions,
          card.instanceId,
          card.availableActions,
        )
        const cardPointerHandlers = getCardPointerHandlers(card.instanceId)

        return (
          <div
            key={`bottom-hand-${card.instanceId}`}
            data-hand-instance-id={card.instanceId}
            data-testid={`bottom-hand-card-${card.instanceId}`}
            draggable={false}
            onDragStart={(event) => {
              event.preventDefault()
            }}
            className={`h-full aspect-[200/277] shrink-0 select-none ${activeDraggedInstanceId === card.instanceId ? 'z-[260] touch-none' : 'touch-manipulation'}`}
            {...cardPointerHandlers}
          >
            <FlippableCard
              isFlipped={faceUpByInstanceId[card.instanceId] ?? true}
              durationMs={340}
              front={
                <div className="group relative h-full w-full overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                  <CardImage
                    src={previewCard ? resolveCardArtUrl(previewCard, CARD_ART_WIDTHS.hud) : null}
                    alt={previewCard?.displayName ?? 'Hand card'}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full rounded-md object-contain"
                  />

                  <NonLeaderCardOverlay
                    previewCard={previewCard}
                    zone="hand"
                    visibilityMode="hover"
                    actionOptions={cardActionOptions}
                    showEmptyActionMessage={showNoActionsMessage}
                    disableInteractions={isReorderDragging}
                    isConnected={isConnected}
                    isActionPending={isActionPending}
                    onSelectActionOption={(actionId) => {
                      const actionOption = cardActionOptions.find((action) => action.actionId === actionId)
                      if (!actionOption) {
                        return
                      }

                      onSelectCardActionOption(actionOption)
                    }}
                  />
                </div>
              }
              back={<CardBack className="h-full w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />}
            />
          </div>
        )
      }}
    />
  )
}
