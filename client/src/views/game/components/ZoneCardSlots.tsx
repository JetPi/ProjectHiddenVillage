import { CardBack, CardImage } from '@/components/ui/cards'
import {PlayCard } from '@/components/ui/game'
import { twMerge } from 'tailwind-merge'
import { LEADER_CARD_IMAGE_CLASS } from '@/views/game/utils/contants'
import { NonLeaderCardOverlay } from '@/views/game/components/NonLeaderCardOverlay'
import { resolveCardActionOptionsForInstanceId, resolveNonLeaderCards } from '@/views/game/utils/functions/cards'
import { 
  getBattleTargetHighlightClass, 
  getCardsAndOptions, 
  getSummonTargetHighlightClass, 
  isCardRestedState, 
  isMatchingInstance, 
  toAnchorId, 
} from './functions/GameZoneFunctions'
import { useMemo } from 'react'
import type { IGameZonesProps } from '../types/gameZones'

export function renderZoneCardSlots(data: IZoneCardSlotsProps) {
    const { cards, zone, visibilityMode, isCurrentPlayerZone, validBattleTargetsByCardId, validSummonTargetsByCardId, selectedSummonTargetsByCardId, props } = data
    const cardOptions = getCardsAndOptions(data.props)
    
    const bottomSupportCardsBySlotIndex = useMemo(() => {
    const cardsBySlot = new Map<number, ReturnType<typeof resolveNonLeaderCards>[number]>()
    for (const [currentIndex, card] of cardOptions.bottomSupportCards.entries()) {
      const resolvedSlotIndex = typeof card.supportSlotIndex === 'number'
        ? card.supportSlotIndex
        : currentIndex

      if (resolvedSlotIndex >= 0 && resolvedSlotIndex < 5) {
        cardsBySlot.set(resolvedSlotIndex, card)
      }
    }

    return cardsBySlot
  }, [cardOptions.bottomSupportCards])

  const topSupportCardsBySlotIndex = useMemo(() => {
    const cardsBySlot = new Map<number, ReturnType<typeof resolveNonLeaderCards>[number]>()
    for (const [currentIndex, card] of cardOptions.topSupportCards.entries()) {
      const resolvedSlotIndex = typeof card.supportSlotIndex === 'number'
        ? card.supportSlotIndex
        : currentIndex

      if (resolvedSlotIndex >= 0 && resolvedSlotIndex < 5) {
        cardsBySlot.set(resolvedSlotIndex, card)
      }
    }

    return cardsBySlot
  }, [cardOptions.topSupportCards])

    return (
      <div className="grid min-h-0 w-full overflow-hidden grid-cols-5 justify-items-center gap-1.5">
        {Array.from({ length: 5 }).map((_, index) => {
          const card = zone === 'support'
            ? (isCurrentPlayerZone
              ? (bottomSupportCardsBySlotIndex.get(index) ?? null)
              : (topSupportCardsBySlotIndex.get(index) ?? null))
            : (cards[index] ?? null)
          const isSelectionSlot = isCurrentPlayerZone
            && props.pendingSetSupportCardInstanceId !== null
            && card === null

          const isSelectionBlocked = isCurrentPlayerZone
            && props.pendingSetSupportCardInstanceId !== null
            && !isSelectionSlot

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
                    ? () => props.  onSelectSupportSlotForSet(index)
                    : undefined
                }
                className={twMerge(
                  'h-full rounded-lg',
                  !isSelectionSlot ? 'cursor-default' : 'cursor-pointer',
                )}
              >
                <PlayCard
                  data-zone={zone}
                  data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
                  data-slot-index={index}
                  data-slot-card="true"
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
            props.availableActions,
            card.instanceId,
            card.availableActions,
          )

          const normalizedCardId = card.instanceId.trim().toLowerCase();

          const targetFlags = {
            isBattleTarget: validBattleTargetsByCardId.has(normalizedCardId),
            isSummonTarget: validSummonTargetsByCardId.has(normalizedCardId),
            isSelectedSummonTarget: selectedSummonTargetsByCardId.has(normalizedCardId),
            isAttackLinkSource: isMatchingInstance(cardOptions.normalizedAttackLinkSourceCardId, normalizedCardId),
            isAttackLinkTarget: isMatchingInstance(cardOptions.normalizedAttackLinkTargetCardId, normalizedCardId),
            isSelectionBlocked
          };

          const cardStateFlags = {
            isRested: isCardRestedState(card, props.optimisticRestedByInstanceId),
            shouldDelayRestedDimming: Boolean(props.gameState.isAttackSequencePending) && targetFlags.isAttackLinkSource,
            isConcealedSupportCard: zone === 'support' && !isCurrentPlayerZone && !card.isFaceUp,
          };

          const visibilityFlags = {
            isCardRested: cardStateFlags.isRested,
            shouldDimRestedCard: cardStateFlags.isRested && !cardStateFlags.shouldDelayRestedDimming,
            isOwnConcealedSupport: zone === 'support' && isCurrentPlayerZone && card.isConcealedFromOpponent === true,
            isConcealedSupport: zone === 'support' && !isCurrentPlayerZone && !card.isFaceUp,
          };


          return (
            <PlayCard
              key={`${zone}-${card.instanceId}`}
              id={toAnchorId(card.instanceId)}
              data-zone={zone}
              data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
              data-slot-index={index}
              data-card-instance-id={card.instanceId}
              data-slot-card="true"
              className={twMerge(
                'group relative h-full overflow-hidden rounded-lg bg-[var(--surface-elevated)]',
                zone === 'support' ? 'border-transparent' : 'border border-[var(--border-subtle)]',
                visibilityFlags.shouldDimRestedCard ? 'opacity-80 saturate-75' : '',
                targetFlags.isSelectionBlocked ? 'opacity-45' : '',
                targetFlags.isBattleTarget ? getBattleTargetHighlightClass(isCurrentPlayerZone ? 'bottom' : 'top') : '',
                targetFlags.isSummonTarget ? getSummonTargetHighlightClass(isCurrentPlayerZone ? 'bottom' : 'top') : '',
                targetFlags.isSelectedSummonTarget ? 'scale-[1.01] bg-amber-200/10' : '',
                targetFlags.isAttackLinkSource || targetFlags.isAttackLinkTarget ? 'attack-link-card-outline' : '',
              )}
              onClick={
                targetFlags.isBattleTarget
                  ? () => props.onSelectAttackTarget(card.instanceId)
                  : (targetFlags.isSummonTarget ? () => props.onToggleSummonTarget(card.instanceId) : undefined)
              }
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

              {cardStateFlags.isConcealedSupportCard ? (
                <div className="pointer-events-none absolute inset-0 z-10 rounded-lg bg-black/18" />
              ) : null}

              {visibilityFlags.isOwnConcealedSupport ? (
                <div
                  className="pointer-events-none absolute inset-0 z-10 rounded-lg"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(135deg, rgba(203, 213, 225, 0.46) 0px, rgba(203, 213, 225, 0.46) 7px, rgba(15, 23, 42, 0.06) 7px, rgba(15, 23, 42, 0.06) 15px)',
                    backgroundColor: 'rgba(51, 65, 85, 0.12)',
                  }}
                />
              ) : null}

              {!cardStateFlags.isConcealedSupportCard ? (
                <NonLeaderCardOverlay
                  previewCard={card.isFaceUp ? (props.derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null) : null}
                  zone={zone}
                  visibilityMode={visibilityMode}
                  actionOptions={actionOptions}
                  hidePreviewButton={props.isBattleActionTargeting && targetFlags.isBattleTarget}
                  showEmptyActionMessage={isCurrentPlayerZone}
                  suppressActionFallback={!isCurrentPlayerZone}
                  isConnected={props.isConnected}
                  isActionPending={props.isActionPending}
                  onSelectActionOption={(actionId) => {
                    const selectedAction = actionOptions.find((action) => action.actionId === actionId)
                    if (!selectedAction) {
                      return
                    }

                    props.onSelectAction(selectedAction)
                  }}
                />
              ) : null}
            </PlayCard>
          )
        })}
      </div>
    )
  }

  export type IZoneCardSlotsProps = {
    cards: ReturnType<typeof resolveNonLeaderCards>,
    zone: 'support',
    visibilityMode: 'hover',
    isCurrentPlayerZone: boolean,
    validBattleTargetsByCardId: Set<string>,
    validSummonTargetsByCardId: Set<string>,
    selectedSummonTargetsByCardId: Set<string>,
    props: IGameZonesProps,
  }