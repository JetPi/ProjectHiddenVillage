import { CardBack, CardImage } from '@/components/ui/cards'
import { PlayCard } from '@/components/ui/game'
import { twMerge } from 'tailwind-merge'
import type { IGameZonesProps } from '@/views/game/types/gameZones'
import { LEADER_CARD_IMAGE_CLASS } from '@/views/game/utils/contants'
import { NonLeaderCardOverlay } from '@/views/game/components/NonLeaderCardOverlay'
import { getBattleTargetHighlightClass, getSummonTargetHighlightClass, toAnchorId } from '@/views/game/components/functions/GameZoneFunctions'
import { resolveCardActionOptionsForInstanceId, resolveNonLeaderCards } from '@/views/game/utils/functions/cards'

export function renderBattlefieldRow(data: IBattleFieldRowProps) {
    const { props } = data

    return (
        <div
            data-zone="character-field-row"
            data-slot-side={data.isCurrentPlayerZone ? 'bottom' : 'top'}
            className="flex h-full min-h-0 w-full items-center justify-start gap-2.5 overflow-visible rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5"
        >
            {data.cards.map((card, index) => {
                const actionOptions = resolveCardActionOptionsForInstanceId(
                    props.availableActions,
                    card.instanceId,
                    card.availableActions,
                )
                const isBattleTarget = data.validBattleTargetsByCardId.has(card.instanceId.trim().toLowerCase())
                const isSummonTarget = data.validSummonTargetsByCardId.has(card.instanceId.trim().toLowerCase())
                const isSelectedSummonTarget = data.selectedSummonTargetsByCardId.has(card.instanceId.trim().toLowerCase())
                const isAttackLinkSource = data.normalizedAttackLinkSourceCardId.length > 0
                    && data.normalizedAttackLinkSourceCardId === card.instanceId.trim().toLowerCase()
                const isAttackLinkTarget = data.normalizedAttackLinkTargetCardId.length > 0
                    && data.normalizedAttackLinkTargetCardId === card.instanceId.trim().toLowerCase()
                const isCardRested = card.isRested || card.isExhausted || data.optimisticRestedByInstanceId[card.instanceId] === true
                const shouldDelayRestedDimming = Boolean(props.gameState.isAttackSequencePending) && isAttackLinkSource
                const shouldDimRestedCard = isCardRested && !shouldDelayRestedDimming

                return (
                    <PlayCard
                        key={`character-field-${card.instanceId}`}
                        id={toAnchorId(card.instanceId)}
                        data-zone="character-field-card"
                        data-slot-side={data.isCurrentPlayerZone ? 'bottom' : 'top'}
                        data-slot-index={index}
                        data-card-instance-id={card.instanceId}
                        className={twMerge(
                            'group relative h-full shrink-0 overflow-hidden rounded-lg bg-[var(--surface-elevated)] transition-transform duration-300 ease-out will-change-transform origin-center',
                            isCardRested ? 'rotate-[14deg]' : 'rotate-0',
                            shouldDimRestedCard ? 'opacity-80 saturate-75' : '',
                            isBattleTarget ? getBattleTargetHighlightClass(data.isCurrentPlayerZone ? 'bottom' : 'top') : '',
                            isSummonTarget ? getSummonTargetHighlightClass(data.isCurrentPlayerZone ? 'bottom' : 'top') : '',
                            isSelectedSummonTarget ? 'scale-[1.01] bg-amber-200/10' : '',
                            isAttackLinkSource || isAttackLinkTarget ? 'attack-link-card-outline' : '',
                        )}
                        onClick={
                            isBattleTarget
                                ? () => props.onSelectAttackTarget(card.instanceId)
                                : (isSummonTarget ? () => props.onToggleSummonTarget(card.instanceId) : undefined)
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
                            <CardBack className="h-full w-full rounded-lg bg-[var(--surface-elevated)]" />
                        )}

                        <NonLeaderCardOverlay
                            previewCard={props.derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null}
                            zone="character-field"
                            visibilityMode="hover"
                            actionOptions={actionOptions}
                            hidePreviewButton={props.isBattleActionTargeting && isBattleTarget}
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
    normalizedAttackLinkSourceCardId: string,
    normalizedAttackLinkTargetCardId: string,
    optimisticRestedByInstanceId: Record<string, boolean>,
    props: IGameZonesProps,
}