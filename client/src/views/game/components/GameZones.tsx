import { Lightbulb, RotateCcw, ScrollText, SkipForward } from 'lucide-react'
import { AppButton } from '@/components/ui'
import { CardBack, CardImage, LeaderCard } from '@/components/ui/cards'
import { PlayCard, PlayPileZone, PlayResourceTracker } from '@/components/ui/game'
import { twMerge } from 'tailwind-merge'
import type { IGameZonesProps } from '@/views/game/types/gameZones'
import { LEADER_CARD_IMAGE_CLASS } from '@/views/game/utils/contants'
import { GamePhaseActionRow } from '@/views/game/components/GamePhaseActionRow'
import { NonLeaderCardOverlay } from '@/views/game/components/NonLeaderCardOverlay'
import { resolveCardActionOptionsForInstanceId, resolveNonLeaderCards } from '@/views/game/utils/functions/cards'

function GameZones({
  boardZoneRef,
  joinCode,
  derivedGameState,
  topDeckCardRef,
  bottomDeckCardRef,
  topTrashCardRef,
  bottomTrashCardRef,
  topLeaderCardFrameClassName,
  bottomLeaderCardFrameClassName,
  gameState,
  authUserId,
  availableActions,
  pendingSetSupportCardInstanceId,
  isConnected,
  isActionPending,
  onSelectAction,
  onSelectSupportSlotForSet,
  onCancelSetSupportSelection,
  onToggleTheme,
  onPassTurn,
}: IGameZonesProps) {
  const { topLeaderCard, bottomLeaderCard } = derivedGameState
  const topSupportCards = resolveNonLeaderCards(
    derivedGameState.opponentPlayer?.supportZone ?? [],
    derivedGameState.cardTypeById,
    derivedGameState.cardById,
  )
  const topBattlefieldCards = resolveNonLeaderCards(
    derivedGameState.opponentPlayer?.characterField ?? [],
    derivedGameState.cardTypeById,
    derivedGameState.cardById,
  )
  const bottomSupportCards = resolveNonLeaderCards(
    derivedGameState.currentPlayer?.supportZone ?? [],
    derivedGameState.cardTypeById,
    derivedGameState.cardById,
  )
  const bottomBattlefieldCards = resolveNonLeaderCards(
    derivedGameState.currentPlayer?.characterField ?? [],
    derivedGameState.cardTypeById,
    derivedGameState.cardById,
  )

  const selectableSupportSlotIndex = pendingSetSupportCardInstanceId
    ? (derivedGameState.currentPlayer?.supportZone.length ?? 0)
    : -1

  function renderZoneCardSlots(
    cards: ReturnType<typeof resolveNonLeaderCards>,
    zone: 'support',
    visibilityMode: 'hover',
    isCurrentPlayerZone: boolean,
  ) {
    return (
      <div className="grid min-h-0 w-full overflow-hidden grid-cols-5 justify-items-center gap-1.5">
        {Array.from({ length: 5 }).map((_, index) => {
          const card = cards[index]
          const isSelectionSlot = isCurrentPlayerZone
            && pendingSetSupportCardInstanceId !== null
            && index === selectableSupportSlotIndex

          const isSelectionBlocked = isCurrentPlayerZone
            && pendingSetSupportCardInstanceId !== null
            && index !== selectableSupportSlotIndex

          if (!card) {
            return (
              <button
                key={`${zone}-empty-${index}`}
                type="button"
                data-zone={zone}
                data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
                data-slot-index={index}
                disabled={!isSelectionSlot}
                onClick={
                  isSelectionSlot
                    ? () => onSelectSupportSlotForSet(index)
                    : undefined
                }
                className={twMerge(
                  'h-full rounded-lg',
                  !isSelectionSlot ? 'cursor-default' : 'cursor-pointer',
                )}
              >
                <PlayCard
                  className={twMerge(
                    'h-full rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]',
                    isSelectionBlocked ? 'opacity-45' : '',
                    isSelectionSlot ? 'border-amber-400/90 bg-amber-300/20' : '',
                  )}
                />
              </button>
            )
          }

          const actionOptions = resolveCardActionOptionsForInstanceId(
            availableActions,
            card.instanceId,
            card.availableActions,
          )

          return (
            <PlayCard
              key={`${zone}-${card.instanceId}`}
              data-zone={zone}
              data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
              data-slot-index={index}
              className={twMerge(
                'group relative h-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]',
                card.isExhausted ? 'opacity-80 saturate-75' : '',
                isSelectionBlocked ? 'opacity-45' : '',
              )}
            >
              {card.isFaceUp ? (
                <CardImage
                  src={card.image}
                  alt={card.displayName}
                  loading="lazy"
                  decoding="async"
                  className={LEADER_CARD_IMAGE_CLASS}
                />
              ) : (
                <CardBack className="h-full w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
              )}

              <NonLeaderCardOverlay
                previewCard={derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null}
                zone={zone}
                visibilityMode={visibilityMode}
                actionOptions={actionOptions}
                isConnected={isConnected}
                isActionPending={isActionPending}
                onSelectActionOption={(actionId) => {
                  const selectedAction = actionOptions.find((action) => action.actionId === actionId)
                  if (!selectedAction) {
                    return
                  }

                  onSelectAction(selectedAction)
                }}
              />
            </PlayCard>
          )
        })}
      </div>
    )
  }

  function renderBattlefieldRow(
    cards: ReturnType<typeof resolveNonLeaderCards>,
    isCurrentPlayerZone: boolean,
  ) {
    return (
      <div
        data-zone="character-field-row"
        data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
        className="flex h-full min-h-0 w-full items-center justify-start gap-1.5 overflow-hidden rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1"
      >
        {cards.map((card) => {
          const actionOptions = resolveCardActionOptionsForInstanceId(
            availableActions,
            card.instanceId,
            card.availableActions,
          )

          return (
            <PlayCard
              key={`character-field-${card.instanceId}`}
              data-zone="character-field-card"
              data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
              className={twMerge(
                'group relative h-full shrink-0 overflow-hidden rounded-lg bg-[var(--surface-elevated)]',
                card.isExhausted ? 'opacity-80 saturate-75' : '',
              )}
            >
              {card.isFaceUp ? (
                <CardImage
                  src={card.image}
                  alt={card.displayName}
                  loading="lazy"
                  decoding="async"
                  className={LEADER_CARD_IMAGE_CLASS}
                />
              ) : (
                <CardBack className="h-full w-full rounded-lg bg-[var(--surface-elevated)]" />
              )}

              <NonLeaderCardOverlay
                previewCard={derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null}
                zone="character-field"
                visibilityMode="hover"
                actionOptions={actionOptions}
                isConnected={isConnected}
                isActionPending={isActionPending}
                onSelectActionOption={(actionId) => {
                  const selectedAction = actionOptions.find((action) => action.actionId === actionId)
                  if (!selectedAction) {
                    return
                  }

                  onSelectAction(selectedAction)
                }}
              />
            </PlayCard>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-1">
      <div ref={boardZoneRef} className="grid min-h-0 overflow-hidden grid-rows-[1fr_1fr_auto_1fr_1fr] gap-1.5 rounded-2xl border border-dashed border-[var(--border-subtle)] p-2 turn-zone-split">
        <div className="row-span-2 grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5 rounded-xl p-1">
          <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
            <PlayPileZone
              side="top"
              labels={['Deck', 'Trash']}
              cardBackTone="blue"
              gameState={derivedGameState}
              deckCardRef={topDeckCardRef}
              trashCardRef={topTrashCardRef}
            />
            <PlayResourceTracker
              cardClassName="turn-band-blue"
              reverse
              isSummonCardReady={derivedGameState.opponentPlayer?.isSummonCardReady ?? true}
            />
          </div>

          <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
            {renderZoneCardSlots(topSupportCards, 'support', 'hover', false)}
            {renderBattlefieldRow(topBattlefieldCards, false)}
          </div>

          <div className="min-h-0">
            <LeaderCard
              className={topLeaderCardFrameClassName}
              imageClassName={LEADER_CARD_IMAGE_CLASS}
              leaderCard={topLeaderCard}
              previewCard={topLeaderCard ? (derivedGameState.cardById.get(topLeaderCard.cardDefinitionId.trim().toLowerCase()) ?? null) : null}
              showBadgeWhenLifeMissing
            />
          </div>
        </div>

        <GamePhaseActionRow
          gameInstance={gameState}
          authUserId={authUserId}
          availableActions={availableActions}
          isConnected={isConnected}
          isActionPending={isActionPending}
          onSelectAction={onSelectAction}
        />

        <div className="row-span-2 grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-1.5 rounded-xl p-1">
          <div className="min-h-0">
            <LeaderCard
              className={bottomLeaderCardFrameClassName}
              imageClassName={LEADER_CARD_IMAGE_CLASS}
              leaderCard={bottomLeaderCard}
              previewCard={bottomLeaderCard ? (derivedGameState.cardById.get(bottomLeaderCard.cardDefinitionId.trim().toLowerCase()) ?? null) : null}
            />
          </div>

          <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
            {renderBattlefieldRow(bottomBattlefieldCards, true)}
            {renderZoneCardSlots(bottomSupportCards, 'support', 'hover', true)}
          </div>

          <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
            <PlayResourceTracker
              cardClassName="turn-band-orange-button"
              isSummonCardReady={derivedGameState.currentPlayer?.isSummonCardReady ?? true}
            />
            <PlayPileZone
              side="bottom"
              labels={['Trash', 'Deck']}
              cardBackTone="orange"
              gameState={derivedGameState}
              deckCardRef={bottomDeckCardRef}
              trashCardRef={bottomTrashCardRef}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end justify-center gap-1">
        {joinCode ? (
          <div className="mb-1 px-0.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-[0.45] [writing-mode:vertical-rl] rotate-180">
            {joinCode}
          </div>
        ) : null}

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            onClick={onToggleTheme}
            aria-label="Toggle light and dark mode"
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <Lightbulb size={10} />
          </AppButton>
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            Toggle Theme
          </span>
        </div>

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            aria-label="Pass turn"
            onClick={onPassTurn}
            disabled={!isConnected || isActionPending}
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <SkipForward size={10} />
          </AppButton>
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            Do Nothing / Pass
          </span>
        </div>

        {pendingSetSupportCardInstanceId ? (
          <div className="group relative">
            <AppButton
              type="button"
              variant="ghost"
              aria-label="Cancel support slot selection"
              onClick={onCancelSetSupportSelection}
              className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
            >
              <span className="text-[10px] font-bold leading-none">X</span>
            </AppButton>
            <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
              Cancel Set Support
            </span>
          </div>
        ) : null}

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            aria-label="Undo action"
            disabled={!isConnected || isActionPending}
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <RotateCcw size={10} />
          </AppButton>
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            Undo Action
          </span>
        </div>

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            aria-label="Open log"
            disabled={!isConnected || isActionPending}
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <ScrollText size={10} />
          </AppButton>
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            Open Log
          </span>
        </div>
      </div>
    </div>
  )
}

export { GameZones }