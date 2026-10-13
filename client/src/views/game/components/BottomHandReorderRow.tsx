import { useCallback, useRef } from 'react'
import { CardBack, CardImage, FlippableCard } from '@/components/ui/cards'
import { GameHandRow } from './GameHandRow'
import { NonLeaderCardOverlay } from './NonLeaderCardOverlay'
import { useGameUIStore } from '@/state/gameUIStore'
import { useLongPressHandReorder } from '@/views/game/hooks/useLongPressHandReorder'
import { resolveCardActionOptionsForInstanceId } from '@/views/game/utils/functions'
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
  isEffectActionTargeting = false,
  validEffectTargetsByCardId,
  onChooseTarget,
}: IBottomHandReorderRowProps) {
  const internalRowRef = useRef<HTMLDivElement | null>(null)

  const handleRowMount = useCallback((node: HTMLDivElement | null) => {
    internalRowRef.current = node
    rowRef(node)
  }, [rowRef])

  const {
    orderedCards,
    activeDraggedInstanceId,
    isReorderDragging,
    getCardPointerHandlers,
  } = useLongPressHandReorder({
    cards,
    rowRef: internalRowRef,
  })

  return (
    <GameHandRow
      cards={orderedCards}
      rowRef={handleRowMount}
      getCardKey={(card) => card.instanceId}
      // The reorder engine moves the dragged card itself (fixed position + transform), so Motion must not
      // also lay the slots out while a drag is in progress.
      isLayoutAnimationEnabled={!isReorderDragging}
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
        const isEffectTargetCandidate =
          isEffectActionTargeting
          && validEffectTargetsByCardId?.has(card.instanceId.trim().toLowerCase()) === true

        return (
          <div
            key={`bottom-hand-${card.instanceId}`}
            data-hand-instance-id={card.instanceId}
            data-testid={`bottom-hand-card-${card.instanceId}`}
            draggable={false}
            onDragStart={(event) => {
              event.preventDefault()
            }}
            className={`h-full w-full select-none ${activeDraggedInstanceId === card.instanceId ? 'z-[260] touch-none' : 'touch-manipulation'}`}
            {...cardPointerHandlers}
          >
            <FlippableCard
              isFlipped={faceUpByInstanceId[card.instanceId] ?? true}
              durationMs={340}
              front={
                <div className="group relative h-full w-full overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                  <CardImage
                    card={previewCard}
                    variant="board"
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
                    isTargetCandidate={isEffectTargetCandidate}
                    onChooseTarget={
                      isEffectTargetCandidate && onChooseTarget
                        ? () => onChooseTarget(card.instanceId)
                        : undefined
                    }
                    // A hand card that an effect selection prompt lists as a candidate answers the prompt with
                    // its own Select button - the same store branch the field/support rows use.
                    isEffectTargetCandidate={
                      validEffectTargetsByCardId?.has(card.instanceId.trim().toLowerCase()) === true
                    }
                    onToggleEffectTarget={
                      validEffectTargetsByCardId?.has(card.instanceId.trim().toLowerCase()) === true
                        ? () => useGameUIStore.getState().toggleEffectTarget(card.instanceId)
                        : undefined
                    }
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
