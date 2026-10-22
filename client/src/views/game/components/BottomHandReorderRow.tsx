import { CardBack, CardImage, FlippableCard } from '@/components/ui/cards'
import { GameHandRow } from './GameHandRow'
import { NonLeaderCardOverlay } from './NonLeaderCardOverlay'
import { useGameUIStore } from '@/state/gameUIStore'
import { useHandRowReorder } from '@/views/game/hooks/useHandRowReorder'
import { resolveCardActionOptionsForInstanceId } from '@/views/game/utils/functions'
import type { IBottomHandReorderRowProps } from '@/views/game/types'

export function BottomHandReorderRow({
  cards,
  rowRef,
  cardById,
  availableActions,
  faceUpByInstanceId,
  isConnected,
  isActionPending,
  onSelectCardActionOption,
  isEffectActionTargeting = false,
  validEffectTargetsByCardId,
  onChooseTarget,
}: IBottomHandReorderRowProps) {
  const {
    orderedCards,
    orderedIds,
    activeInstanceId,
    isReorderDragging,
    isDraggableCard,
    handleReorder,
    handleDragStateChange,
  } = useHandRowReorder({ cards })

  return (
    <GameHandRow
      cards={orderedCards}
      rowRef={rowRef}
      getCardKey={(card) => card.instanceId}
      rowTestId="bottom-hand-row"
      rowClassName="overflow-visible"
      reorder={{
        values: orderedIds,
        onReorder: handleReorder,
        isDraggableCard,
        activeValue: activeInstanceId,
        onDragStateChange: handleDragStateChange,
      }}
      renderCard={(card) => {
        const previewCard = cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null
        const cardActionOptions = resolveCardActionOptionsForInstanceId(
          availableActions,
          card.instanceId,
          card.availableActions,
        )
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
            className="h-full w-full select-none"
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
                    disableInteractions={isReorderDragging}
                    isTargetCandidate={isEffectTargetCandidate}
                    onChooseTarget={
                      isEffectTargetCandidate && onChooseTarget
                        ? () => onChooseTarget(card.instanceId)
                        : undefined
                    }
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
