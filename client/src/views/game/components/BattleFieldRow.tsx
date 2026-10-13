import { motion } from 'motion/react'
import { CardBack, CardImage } from '@/components/ui/cards'
import { PlayCard } from '@/components/ui/game'
import { BOARD_MOVEMENT_EASE, RESTED_CARD_TILT_DEG, RESTED_CARD_TILT_DURATION_MS } from '@/views/game/animation/tuning'
import { twMerge } from 'tailwind-merge'
import type { IGameZonesProps } from '@/views/game/types'
import { LEADER_CARD_IMAGE_CLASS } from '@/views/game/utils/contants'
import { NonLeaderCardOverlay } from './NonLeaderCardOverlay'
import { useGameUIStore } from '@/state/gameUIStore'
import { getBattleTargetHighlightClass, getSummonTargetHighlightClass, toAnchorId, resolveCardActionOptionsForInstanceId, resolveNonLeaderCards } from '@/views/game/utils/functions'

export function renderBattlefieldRow(data: IBattleFieldRowProps) {
    const { props } = data

    return (
        <div
            data-zone="character-field-row"
            data-slot-side={data.isCurrentPlayerZone ? 'bottom' : 'top'}
            className="flex h-full min-h-0 w-full items-center justify-start gap-5 overflow-visible rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5"
        >
            {data.cards.map((card, index) => {
                const actionOptions = resolveCardActionOptionsForInstanceId(
                    props.availableActions,
                    card.instanceId,
                    card.availableActions,
                )
                const isBattleTarget = data.validBattleTargetsByCardId.has(card.instanceId.trim().toLowerCase())
                const isTargetCandidate = data.isBattleActionTargeting && isBattleTarget
                const isSummonTarget = data.validSummonTargetsByCardId.has(card.instanceId.trim().toLowerCase())
                const isSummonTargetCandidate = data.isSummonActionTargeting && isSummonTarget
                const summonRequirementText = isSummonTarget
                    ? (data.summonRequirementTextByCardInstanceId.get(card.instanceId.trim().toLowerCase()) ?? null)
                    : null
                const isSelectedSummonTarget = data.selectedSummonTargetsByCardId.has(card.instanceId.trim().toLowerCase())
                const isEffectTargetCandidate = data.isEffectMultiTargeting
                    && data.validEffectTargetsByCardId.has(card.instanceId.trim().toLowerCase())
                const isSelectedEffectTarget = data.selectedEffectTargetsByCardId.has(card.instanceId.trim().toLowerCase())
                const isAttackLinkSource = data.normalizedAttackLinkSourceCardId.length > 0
                    && data.normalizedAttackLinkSourceCardId === card.instanceId.trim().toLowerCase()
                const isAttackLinkTarget = data.normalizedAttackLinkTargetCardId.length > 0
                    && data.normalizedAttackLinkTargetCardId === card.instanceId.trim().toLowerCase()
                const isCardRested = card.isRested || data.optimisticRestedByInstanceId[card.instanceId] === true
                const shouldDelayRestedDimming = Boolean(props.gameState.isAttackSequencePending) && isAttackLinkSource
                const shouldDimRestedCard = isCardRested && !shouldDelayRestedDimming

                return (
                    <motion.div
                        key={`character-field-${card.instanceId}`}
                        // Motion owns the board card's transform: the rested tilt is an animated property here
                        // instead of a CSS `transition-transform` class, so nothing else writes `transform` and
                        // the permanent `will-change-transform` the old class carried is gone.
                        animate={{ rotate: isCardRested ? RESTED_CARD_TILT_DEG : 0 }}
                        transition={{ duration: RESTED_CARD_TILT_DURATION_MS / 1000, ease: BOARD_MOVEMENT_EASE }}
                        // `position` only: when a card leaves or joins the row the remaining cards slide into
                        // their new slots instead of snapping, and card art is never left at a fractional scale.
                        // Deliberately no `layoutId`: cross-zone travel is still drawn by the flight layer's
                        // overlay copy, and a shared layout id would double-animate the same move.
                        layout="position"
                        className="h-full w-auto shrink-0 origin-center aspect-[200/277]"
                    >
                        <PlayCard
                            id={toAnchorId(card.instanceId)}
                            data-zone="character-field-card"
                            data-slot-side={data.isCurrentPlayerZone ? 'bottom' : 'top'}
                            data-slot-index={index}
                            data-card-instance-id={card.instanceId}
                            className={twMerge(
                                'group relative h-full w-full overflow-hidden rounded-lg bg-[var(--surface-elevated)]',
                                shouldDimRestedCard ? 'opacity-80 saturate-75' : '',
                                isBattleTarget ? getBattleTargetHighlightClass(data.isCurrentPlayerZone ? 'bottom' : 'top') : '',
                                isSummonTarget ? getSummonTargetHighlightClass(data.isCurrentPlayerZone ? 'bottom' : 'top') : '',
                                isAttackLinkSource || isAttackLinkTarget ? 'attack-link-card-outline' : '',
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

                            {isSelectedSummonTarget || isSelectedEffectTarget ? (
                                <div className="card-selection-tint pointer-events-none absolute inset-0 rounded-lg border-2 border-amber-300/95 bg-amber-300/15" />
                            ) : null}

                            <NonLeaderCardOverlay
                                previewCard={props.derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null}
                                card={card}
                                zone="battlefield"
                                visibilityMode="hover"
                                actionOptions={actionOptions}
                                isTargetCandidate={isTargetCandidate}
                                onChooseTarget={() => props.onSelectAttackTarget(card.instanceId)}
                                isSummonTargetCandidate={isSummonTargetCandidate}
                                isSummonTargetSelected={isSelectedSummonTarget}
                                onToggleSummonTarget={
                                    isSummonTargetCandidate
                                        ? () => useGameUIStore.getState().toggleSummonTarget(card.instanceId)
                                        : undefined
                                }
                                summonRequirementText={summonRequirementText}
                                isEffectTargetCandidate={isEffectTargetCandidate}
                                isEffectTargetSelected={isSelectedEffectTarget}
                                onToggleEffectTarget={
                                    isEffectTargetCandidate
                                        ? () => useGameUIStore.getState().toggleEffectTarget(card.instanceId)
                                        : undefined
                                }
                                showEmptyActionMessage={data.isCurrentPlayerZone}
                                suppressActionFallback={!data.isCurrentPlayerZone}
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
                        </PlayCard>
                    </motion.div>
                )
            })}
        </div>
    )
}

export type IBattleFieldRowProps = {
    cards: ReturnType<typeof resolveNonLeaderCards>,
    isCurrentPlayerZone: boolean,
    validBattleTargetsByCardId: Set<string>,
    validSummonTargetsByCardId: Set<string>,
    selectedSummonTargetsByCardId: Set<string>,
    validEffectTargetsByCardId: Set<string>,
    selectedEffectTargetsByCardId: Set<string>,
    summonRequirementTextByCardInstanceId: ReadonlyMap<string, string>,
    normalizedAttackLinkSourceCardId: string,
    normalizedAttackLinkTargetCardId: string,
    optimisticRestedByInstanceId: Record<string, boolean>,
    isBattleActionTargeting: boolean,
    isSummonActionTargeting: boolean,
    isEffectActionTargeting: boolean,
    isEffectMultiTargeting: boolean,
    props: IGameZonesProps,
}