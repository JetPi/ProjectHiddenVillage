import { useMemo } from 'react'
import { twMerge } from 'tailwind-merge'
import { LeaderCard } from '@/components/ui/cards'
import { PlayBottomResourceZone, PlayPileZone, PlayTopResourceZone } from '@/components/ui/game'
import { GamePhaseActionRow } from './GamePhaseActionRow'
import type { IAttackLinkRenderConfig, IGameZonesProps  } from '@/views/game/types'
import {
  buildLeaderCardProps,
  extractTargetIds,
  getCardsAndOptions,
  isCardInstanceBattleTarget,
  isCardRestedState,
  resolveAttackAnchorConfig,
  toAnchorId,
  withSourceGap,
  withTargetGap,
  withTargetGapAndHorizontalNudge
} from '@/views/game/utils/functions'
import { renderBattlefieldRow } from './BattleFieldRow'
import { RenderZoneCardSlots } from './ZoneCardSlots'
import { AttackLinkArrow } from './AttackLinkArrow'
import { SideBarButtons } from './SidebarButtons'
import { useGameUIStore } from '@/state/gameUIStore'
import { useBackendAttackLink } from '@/views/game/hooks/GameView/memos/useBackendAttackLink'

const ATTACK_OUTLINE_WIDTH_PX = 4.5
const ATTACK_OUTLINE_OFFSET_PX = 4
const ATTACK_OUTLINE_OUTER_REACH_PX = ATTACK_OUTLINE_WIDTH_PX + ATTACK_OUTLINE_OFFSET_PX
const ATTACK_ARROW_HEAD_RETRACTION_COMPENSATION_PX = 7.5
const ATTACK_LINK_SOURCE_GAP_PX = ATTACK_OUTLINE_OUTER_REACH_PX
const ATTACK_LINK_TARGET_GAP_PX = ATTACK_OUTLINE_OUTER_REACH_PX + ATTACK_ARROW_HEAD_RETRACTION_COMPENSATION_PX
const ATTACK_VERTICAL_DIRECTION_BIAS_PX = 2
const ATTACK_VERTICAL_TARGET_GAP_PX = ATTACK_OUTLINE_OUTER_REACH_PX + 2
const ATTACK_HEAD_OFFSET_DEFAULT = 0.25

function GameZones(props: IGameZonesProps) {
  const { topLeaderCard, bottomLeaderCard } = props.derivedGameState
  const pendingCardTargeting = useGameUIStore((state) => state.pendingCardTargeting)
  const pendingSummonTargeting = useGameUIStore((state) => state.pendingSummonTargeting)
  const optimisticRestedByInstanceId = useGameUIStore((state) => state.optimisticRestedByInstanceId)
  const optimisticActiveAttackLink = useGameUIStore((state) => state.activeAttackLink)
  const isBattleActionTargeting = pendingCardTargeting !== null
  const isEffectActionTargeting = pendingCardTargeting?.kind === 'effect'
  const backendAttackLink = useBackendAttackLink({ gameState: props.gameState })
  const renderedAttackLink = optimisticActiveAttackLink ?? backendAttackLink
  const {
    boardZoneRef,
    topDeckCardRef,
    bottomDeckCardRef,
    topTrashCardRef,
    bottomTrashCardRef,
  } = props
  const cardOptions = getCardsAndOptions(props, renderedAttackLink)

  const cardRestedStateByInstanceId = useMemo(() => {
    const restedById = new Map<string, boolean>();
    const allCards = [
      topLeaderCard,
      bottomLeaderCard,
      ...cardOptions.topSupportCards,
      ...cardOptions.bottomSupportCards,
      ...cardOptions.topBattlefieldCards,
      ...cardOptions.bottomBattlefieldCards,
    ];

    for (const card of allCards) {
      if (!card) continue;
      const normalizedId = card.instanceId.trim().toLowerCase();
      restedById.set(normalizedId, isCardRestedState(card, optimisticRestedByInstanceId));
    }

    return restedById;
  }, [
    topLeaderCard,
    bottomLeaderCard,
    cardOptions.topSupportCards,
    cardOptions.bottomSupportCards,
    cardOptions.topBattlefieldCards,
    cardOptions.bottomBattlefieldCards,
    optimisticRestedByInstanceId,
  ]);

  const attackLinkRenderConfig = useMemo<IAttackLinkRenderConfig | null>(() => {
    if (!renderedAttackLink) return null;

    const startId = toAnchorId(renderedAttackLink.sourceCardInstanceId);
    const endId = toAnchorId(renderedAttackLink.targetCardInstanceId);
    const defaultConfig: IAttackLinkRenderConfig = {
      startId,
      endId,
      startAnchor: withSourceGap('top', ATTACK_LINK_SOURCE_GAP_PX),
      endAnchor: withTargetGap('left', ATTACK_LINK_TARGET_GAP_PX),
      path: 'smooth',
      curveness: 0.68,
      headOffsetForward: ATTACK_HEAD_OFFSET_DEFAULT,
    };

    if (typeof document === 'undefined') return defaultConfig;

    const boardElement = document.querySelector<HTMLElement>('[data-testid="game-board"]');
    const sourceCard = boardElement?.querySelector<HTMLElement>(`#${startId}`);
    const targetCard = boardElement?.querySelector<HTMLElement>(`#${endId}`);
    if (!boardElement || !sourceCard || !targetCard) return defaultConfig;

    const isTargetRested = cardRestedStateByInstanceId.get(renderedAttackLink.targetCardInstanceId.trim().toLowerCase()) === true;
    const metrics = resolveAttackAnchorConfig(sourceCard, targetCard, isTargetRested);

    if (metrics.isVerticallyAligned) {
      const boardRect = boardElement.getBoundingClientRect();
      const boardCenterX = boardRect.left + boardRect.width * 0.5;
      const linkCenterX = (metrics.sourceCenter.x + metrics.targetCenter.x) * 0.5;
      const inwardSide: 'left' | 'right' = linkCenterX <= boardCenterX ? 'right' : 'left';
      const sideBend = inwardSide === 'right' ? 110 : -110;
      const verticalSourceGap = ATTACK_VERTICAL_TARGET_GAP_PX + ATTACK_VERTICAL_DIRECTION_BIAS_PX;

      return {
        startId,
        endId,
        startAnchor: withSourceGap(inwardSide, verticalSourceGap),
        endAnchor: withTargetGapAndHorizontalNudge(inwardSide, ATTACK_VERTICAL_TARGET_GAP_PX, metrics.resolvedTargetAnchorNudge),
        path: 'smooth',
        curveness: 0.86,
        headOffsetForward: metrics.resolvedHeadOffsetForward,
        controlPointOffsets: { cpx1: sideBend, cpx2: sideBend * 1.25 },
      };
    }

    return {
      startId,
      endId,
      startAnchor: withSourceGap(metrics.startAnchor, ATTACK_LINK_SOURCE_GAP_PX),
      endAnchor: withTargetGapAndHorizontalNudge(metrics.endAnchor, ATTACK_LINK_TARGET_GAP_PX, metrics.resolvedTargetAnchorNudge),
      path: 'smooth',
      curveness: 0.68,
      headOffsetForward: metrics.resolvedHeadOffsetForward,
    };
  }, [renderedAttackLink, cardRestedStateByInstanceId]);

  const validBattleTargetsByCardId = useMemo(
    () => extractTargetIds(pendingCardTargeting?.validTargets),
    [pendingCardTargeting]
  );

  const validSummonTargetsByCardId = useMemo(
    () => extractTargetIds(pendingSummonTargeting?.validTargets),
    [pendingSummonTargeting]
  );

  const selectedSummonTargetsByCardId = useMemo(
    () => extractTargetIds(pendingSummonTargeting?.selectedTargets),
    [pendingSummonTargeting]
  );

  const summonRequirementTextByCardInstanceId = useMemo(() => {
    const nextMap = new Map<string, string>()
    const requirementLabels = pendingSummonTargeting?.requirementLabelsByCardInstanceId ?? null
    if (!requirementLabels) {
      return nextMap
    }

    for (const [instanceId, labels] of Object.entries(requirementLabels)) {
      const normalizedInstanceId = instanceId.trim().toLowerCase()
      if (!normalizedInstanceId) {
        continue
      }

      const fulfilledLabels = (labels ?? []).filter((label) => label.trim().length > 0)
      nextMap.set(normalizedInstanceId, fulfilledLabels.length > 0 ? fulfilledLabels.join(' · ') : 'any')
    }

    return nextMap
  }, [pendingSummonTargeting])

  const isTopLeaderBattleTarget = useMemo(
    () => isCardInstanceBattleTarget(topLeaderCard, validBattleTargetsByCardId),
    [topLeaderCard, validBattleTargetsByCardId]
  );

  const isBottomLeaderBattleTarget = useMemo(
    () => isCardInstanceBattleTarget(bottomLeaderCard, validBattleTargetsByCardId),
    [bottomLeaderCard, validBattleTargetsByCardId]
  );

  const resolveLeaderRestedState = (instanceId: string | undefined) =>
    instanceId ? cardRestedStateByInstanceId.get(instanceId.trim().toLowerCase()) === true : false

  const topLeaderCardProps = buildLeaderCardProps(props, {
    card: cardOptions.topLeaderCard,
    slotSide: 'top',
    isBattleTarget: isTopLeaderBattleTarget,
    actionOptions: cardOptions.topLeaderActionOptions,
    activeAttackLink: renderedAttackLink,
    hidePreviewWhenBattleTarget: isBattleActionTargeting,
    showBadgeWhenLifeMissing: true,
    isRested: resolveLeaderRestedState(cardOptions.topLeaderCard?.instanceId),
  })

  const bottomLeaderCardProps = buildLeaderCardProps(props, {
    card: cardOptions.bottomLeaderCard,
    slotSide: 'bottom',
    isBattleTarget: isBottomLeaderBattleTarget,
    actionOptions: cardOptions.bottomLeaderActionOptions,
    activeAttackLink: renderedAttackLink,
    hidePreviewWhenBattleTarget: isBattleActionTargeting,
    isRested: resolveLeaderRestedState(cardOptions.bottomLeaderCard?.instanceId),
  })

  const battlefieldRowProps = {
    cards: cardOptions.topBattlefieldCards,
    validBattleTargetsByCardId,
    validSummonTargetsByCardId,
    selectedSummonTargetsByCardId,
    summonRequirementTextByCardInstanceId,
    optimisticRestedByInstanceId,
    isBattleActionTargeting,
    isSummonActionTargeting: pendingSummonTargeting !== null,
    isEffectActionTargeting,
    props,
  }

  const renderZoneCardSlotsProps = {
    cards: cardOptions.topBattlefieldCards,
    validBattleTargetsByCardId,
    validSummonTargetsByCardId,
    selectedSummonTargetsByCardId,
    summonRequirementTextByCardInstanceId,
    props,
  }

  console.log(props.gameState)

  return (
    <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-0.5">
      <div
        ref={boardZoneRef}
        data-testid="game-board"
        className="game-board-spill relative grid min-h-0 overflow-visible grid-rows-[1fr_1fr_auto_1fr_1fr] gap-1 rounded-2xl pt-2 pr-0.5 pb-2 pl-2 turn-zone-split"
      >
        {attackLinkRenderConfig ? (
          <>
            <AttackLinkArrow config={attackLinkRenderConfig} />
          </>
        ) : null}

        <div className="relative z-20 row-span-2 grid min-h-0 grid-cols-[var(--resource-rail-max-width)_minmax(0,1fr)_var(--resource-rail-max-width)] gap-1 rounded-xl p-0.5">
          <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
            <PlayPileZone
              side="top"
              labels={['Deck', 'Trash']}
              cardBackTone="blue"
              gameState={props.derivedGameState}
              deckCardRef={topDeckCardRef}
              trashCardRef={topTrashCardRef}
            />
            <PlayTopResourceZone
            currentChakra={props.derivedGameState.opponentPlayer?.resourcePool ?? 0}
              isSummonCardReady={props.derivedGameState.opponentPlayer?.isSummonCardReady ?? true}
            />
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-2">
            {RenderZoneCardSlots({ ...renderZoneCardSlotsProps, zone: 'support', visibilityMode: 'hover', isCurrentPlayerZone: false })}
            {renderBattlefieldRow({
              ...battlefieldRowProps,
              cards: cardOptions.topBattlefieldCards,
              isCurrentPlayerZone: false,
              normalizedAttackLinkSourceCardId: cardOptions.normalizedAttackLinkSourceCardId,
              normalizedAttackLinkTargetCardId: cardOptions.normalizedAttackLinkTargetCardId,
            })}
          </div>

          <div className="flex min-h-0 w-full justify-end pr-3">
            <div
              className={twMerge(
                props.topLeaderCardFrameClassName,
                'relative overflow-visible',
              )}
            >
              <LeaderCard {...topLeaderCardProps} />
            </div>
          </div>
        </div>

        <div className="relative z-10 my-0.5">
          <GamePhaseActionRow
            gameInstance={props.gameState}
            authUserId={props.authUserId}
            availableActions={props.availableActions}
            isConnected={props.isConnected}
            isActionPending={props.isActionPending}
            onSelectAction={props.onSelectAction}
            onConfirmSummonTargetSelection={props.onConfirmSummonTargetSelection}
            phaseTestId="phase-indicator"
          />
        </div>

        <div className="relative z-20 row-span-2 grid min-h-0 grid-cols-[var(--resource-rail-max-width)_minmax(0,1fr)_var(--resource-rail-max-width)] gap-1 rounded-xl p-0.5">
          <div className="min-h-0 w-full pl-2">
            <div
              className={twMerge(
                props.bottomLeaderCardFrameClassName,
                'relative overflow-visible',
              )}
            >
              <LeaderCard {...bottomLeaderCardProps} />
            </div>
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-2">
            {renderBattlefieldRow({
              ...battlefieldRowProps,
              cards: cardOptions.bottomBattlefieldCards,
              isCurrentPlayerZone: true,
              normalizedAttackLinkSourceCardId: cardOptions.normalizedAttackLinkSourceCardId,
              normalizedAttackLinkTargetCardId: cardOptions.normalizedAttackLinkTargetCardId,
            })}
            {RenderZoneCardSlots({ ...renderZoneCardSlotsProps, zone: 'support', visibilityMode: 'hover', isCurrentPlayerZone: true })}
          </div>

          <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
            <PlayBottomResourceZone
              currentChakra={props.derivedGameState.currentPlayer?.resourcePool ?? 0}
              isSummonCardReady={props.derivedGameState.currentPlayer?.isSummonCardReady ?? true}
            />
            <PlayPileZone
              side="bottom"
              labels={['Trash', 'Deck']}
              cardBackTone="orange"
              gameState={props.derivedGameState}
              deckCardRef={bottomDeckCardRef}
              trashCardRef={bottomTrashCardRef}
            />
          </div>
        </div>
      </div>

      <SideBarButtons {...props} />
    </div>
  )
}

export { GameZones }