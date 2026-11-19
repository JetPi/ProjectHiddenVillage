import { twMerge } from 'tailwind-merge'
import { useEffect, useMemo } from 'react'
import { CardBack, CardImage } from '@/components/ui/cards'
import { CARD_SIZES } from '@/components/ui/cards/constants'
import {PlayCard } from '@/components/ui/game'
import { LEADER_CARD_IMAGE_CLASS } from '@/views/game/utils/contants'
import { NonLeaderCardOverlay } from './NonLeaderCardOverlay'
import {
  buildSupportSlotLayout,
  getBattleTargetHighlightClass,
  getCardsAndOptions,
  getSummonTargetHighlightClass,
  isCardRestedState,
  isMatchingInstance,
  toAnchorId,
  resolveCardActionOptionsForInstanceId,
  SUPPORT_SLOT_COUNT,
} from '@/views/game/utils/functions'
import type { IZoneCardSlotsProps } from '@/views/game/types'
import { useGameUIStore } from '@/state/gameUIStore'

export function RenderZoneCardSlots(data: IZoneCardSlotsProps) {
    const { cards, zone, visibilityMode, isCurrentPlayerZone, validBattleTargetsByCardId, validSummonTargetsByCardId, selectedSummonTargetsByCardId, validEffectTargetsByCardId, selectedEffectTargetsByCardId, props } = data
    const cardOptions = getCardsAndOptions(data.props, null)
    const optimisticRestedByInstanceId = useGameUIStore((state) => state.optimisticRestedByInstanceId)
    const isBattleActionTargeting = useGameUIStore((state) => state.pendingCardTargeting !== null)
    const isSummonActionTargeting = useGameUIStore((state) => state.pendingSummonTargeting !== null)
    const isEffectMultiTargeting = useGameUIStore((state) => state.pendingEffectTargeting !== null)

    // One card per slot, decided by the data alone: a card whose slot is taken or missing takes a free slot
    // instead of being dropped, so the row no longer loses a card or slides its neighbours on a refresh.
    const bottomSupportLayout = useMemo(
      () => buildSupportSlotLayout(cardOptions.bottomSupportCards),
      [cardOptions.bottomSupportCards],
    )
    const topSupportLayout = useMemo(
      () => buildSupportSlotLayout(cardOptions.topSupportCards),
      [cardOptions.topSupportCards],
    )
    const supportLayout = isCurrentPlayerZone ? bottomSupportLayout : topSupportLayout

    useEffect(() => {
      if (!import.meta.env.DEV) {
        return
      }

      if (supportLayout.contestedSlotIndexes.length === 0 && supportLayout.overflowInstanceIds.length === 0) {
        return
      }

      console.warn(
        '[support-row] the engine published a support row that cannot be drawn one card per slot',
        {
          side: isCurrentPlayerZone ? 'bottom' : 'top',
          contestedSlotIndexes: supportLayout.contestedSlotIndexes,
          displacedInstanceIds: supportLayout.displacedInstanceIds,
          overflowInstanceIds: supportLayout.overflowInstanceIds,
        },
      )
    }, [isCurrentPlayerZone, supportLayout])

    return (
      <div className="card-drop-zone grid min-h-0 w-full overflow-hidden grid-cols-5 justify-items-center gap-1.5">
        {Array.from({ length: SUPPORT_SLOT_COUNT }).map((_, index) => {
          const card = zone === 'support'
            ? (supportLayout.slots[index] ?? null)
            : (cards[index] ?? null)

          if (!card) {
            return (
              <button
                key={`${zone}-empty-${index}`}
                type="button"
                data-zone={zone}
                data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
                data-slot-index={index}
                disabled
                className="h-full cursor-default rounded-lg"
              >
                <PlayCard
                  data-zone={zone}
                  data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
                  data-slot-index={index}
                  data-slot-card="true"
                  className="h-full rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]"
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
            isSummonTargetCandidate: isSummonActionTargeting && validSummonTargetsByCardId.has(normalizedCardId),
            isSelectedSummonTarget: selectedSummonTargetsByCardId.has(normalizedCardId),
            isEffectTargetCandidate: isEffectMultiTargeting && validEffectTargetsByCardId.has(normalizedCardId),
            isSelectedEffectTarget: selectedEffectTargetsByCardId.has(normalizedCardId),
            isAttackLinkSource: isMatchingInstance(cardOptions.normalizedAttackLinkSourceCardId, normalizedCardId),
            isAttackLinkTarget: isMatchingInstance(cardOptions.normalizedAttackLinkTargetCardId, normalizedCardId),
          };

          const summonRequirementText = targetFlags.isSummonTarget
            ? (data.summonRequirementTextByCardInstanceId.get(normalizedCardId) ?? null)
            : null

          const isShownFaceUp = card.isFaceUp || card.isRevealed

          const cardStateFlags = {
            isRested: isCardRestedState(card, optimisticRestedByInstanceId),
            shouldDelayRestedDimming: Boolean(props.gameState.isAttackSequencePending) && targetFlags.isAttackLinkSource,
            isConcealedSupportCard: zone === 'support' && !isCurrentPlayerZone && !isShownFaceUp,
          };

          const visibilityFlags = {
            isCardRested: cardStateFlags.isRested,
            shouldDimRestedCard: cardStateFlags.isRested && !cardStateFlags.shouldDelayRestedDimming,
            isOwnConcealedSupport: zone === 'support' && isCurrentPlayerZone && card.isConcealedFromOpponent === true,
            isConcealedSupport: zone === 'support' && !isCurrentPlayerZone && !isShownFaceUp,
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
                'group relative h-full min-h-0 w-auto min-w-0 max-w-full overflow-hidden rounded-lg bg-[var(--surface-elevated)]',
                zone === 'support' ? 'border-transparent' : 'border border-[var(--border-subtle)]',
                visibilityFlags.shouldDimRestedCard ? 'opacity-80 saturate-75' : '',
                targetFlags.isBattleTarget ? getBattleTargetHighlightClass(isCurrentPlayerZone ? 'bottom' : 'top') : '',
                targetFlags.isSummonTarget ? getSummonTargetHighlightClass(isCurrentPlayerZone ? 'bottom' : 'top') : '',
                targetFlags.isAttackLinkSource || targetFlags.isAttackLinkTarget ? 'attack-link-card-outline' : '',
              )}
            >
              {isShownFaceUp ? (
                <CardImage
                  src={card.image}
                  srcSet={card.imageSrcSet || undefined}
                  sizes={zone === 'support' ? CARD_SIZES.supportSlot : CARD_SIZES.battlefieldCard}
                  alt={card.displayName}
                  loading="lazy"
                  decoding="async"
                  className={LEADER_CARD_IMAGE_CLASS}
                />
              ) : (
                <CardBack className="h-full w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
              )}

              {cardStateFlags.isConcealedSupportCard ? (
                <div className="card-overlay-layer pointer-events-none absolute inset-0 z-10 rounded-lg bg-black/18" />
              ) : null}

              {visibilityFlags.isOwnConcealedSupport ? (
                <div
                  className="card-overlay-layer pointer-events-none absolute inset-0 z-10 rounded-lg"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(135deg, rgba(203, 213, 225, 0.46) 0px, rgba(203, 213, 225, 0.46) 7px, rgba(15, 23, 42, 0.06) 7px, rgba(15, 23, 42, 0.06) 15px)',
                    backgroundColor: 'rgba(51, 65, 85, 0.12)',
                  }}
                />
              ) : null}

              {!cardStateFlags.isConcealedSupportCard && (targetFlags.isSelectedSummonTarget || targetFlags.isSelectedEffectTarget) ? (
                <div className="card-selection-tint pointer-events-none absolute inset-0 rounded-lg border-2 border-amber-300/95 bg-amber-300/15" />
              ) : null}

              {!cardStateFlags.isConcealedSupportCard ? (
                <NonLeaderCardOverlay
                  previewCard={isShownFaceUp ? (props.derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null) : null}
                  card={card}
                  zone={zone}
                  visibilityMode={visibilityMode}
                  actionOptions={actionOptions}
                  isTargetCandidate={isBattleActionTargeting && targetFlags.isBattleTarget}
                  onChooseTarget={() => props.onSelectAttackTarget(card.instanceId)}
                  isSummonTargetCandidate={targetFlags.isSummonTargetCandidate}
                  isSummonTargetSelected={targetFlags.isSelectedSummonTarget}
                  onToggleSummonTarget={
                    targetFlags.isSummonTargetCandidate
                      ? () => useGameUIStore.getState().toggleSummonTarget(card.instanceId)
                      : undefined
                  }
                  summonRequirementText={summonRequirementText}
                  isEffectTargetCandidate={targetFlags.isEffectTargetCandidate}
                  isEffectTargetSelected={targetFlags.isSelectedEffectTarget}
                  onToggleEffectTarget={
                    targetFlags.isEffectTargetCandidate
                      ? () => useGameUIStore.getState().toggleEffectTarget(card.instanceId)
                      : undefined
                  }
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
