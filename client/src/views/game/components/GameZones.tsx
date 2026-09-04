import { Lightbulb, RotateCcw, ScrollText, SkipForward } from 'lucide-react'
import { useMemo } from 'react'
import Xarrow from 'react-xarrows'
import { AppButton } from '@/components/ui'
import { LeaderCard } from '@/components/ui/cards'
import { PlayBottomResourceZone, PlayPileZone, PlayTopResourceZone } from '@/components/ui/game'
import { twMerge } from 'tailwind-merge'
import type { IGameZonesProps } from '@/views/game/types/gameZones'
import { LEADER_CARD_IMAGE_CLASS } from '@/views/game/utils/contants'
import { GamePhaseActionRow } from '@/views/game/components/GamePhaseActionRow'
import type { IAttackLinkRenderConfig } from '../types/viewModels'
import { renderBattlefieldRow } from './BattleFieldRow'
import {
  extractTargetIds,
  getCardsAndOptions,
  isCardInstanceBattleTarget,
  isCardRestedState,
  resolveAttackAnchorConfig,
  toAnchorId,
  withSourceGap,
  withTargetGap,
  withTargetGapAndHorizontalNudge
} from './functions/GameZoneFunctions'
import { renderZoneCardSlots } from './ZoneCardSlots'
import { AttackLinkArrow } from './AttackLinkArrow'

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
  const { optimisticRestedByInstanceId } = props
  const cardOptions = getCardsAndOptions(props)

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
      restedById.set(normalizedId, isCardRestedState(card, props.optimisticRestedByInstanceId));
    }

    return restedById;
  }, [
    topLeaderCard,
    bottomLeaderCard,
    cardOptions.topSupportCards,
    cardOptions.bottomSupportCards,
    cardOptions.topBattlefieldCards,
    cardOptions.bottomBattlefieldCards,
    props.optimisticRestedByInstanceId,
  ]);

  const attackLinkRenderConfig = useMemo<IAttackLinkRenderConfig | null>(() => {
    if (!props.activeAttackLink) return null;

    const startId = toAnchorId(props.activeAttackLink.sourceCardInstanceId);
    const endId = toAnchorId(props.activeAttackLink.targetCardInstanceId);
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

    const isTargetRested = cardRestedStateByInstanceId.get(props.activeAttackLink.targetCardInstanceId.trim().toLowerCase()) === true;
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
  }, [props.activeAttackLink, cardRestedStateByInstanceId]);

  const validBattleTargetsByCardId = useMemo(
    () => extractTargetIds(props.pendingAttackTargeting?.validTargets),
    [props.pendingAttackTargeting]
  );

  const validSummonTargetsByCardId = useMemo(
    () => extractTargetIds(props.pendingSummonTargeting?.validTargets),
    [props.pendingSummonTargeting]
  );

  const selectedSummonTargetsByCardId = useMemo(
    () => extractTargetIds(props.pendingSummonTargeting?.selectedTargets),
    [props.pendingSummonTargeting]
  );

  const isTopLeaderBattleTarget = useMemo(
    () => isCardInstanceBattleTarget(topLeaderCard, validBattleTargetsByCardId),
    [topLeaderCard, validBattleTargetsByCardId]
  );

  const isBottomLeaderBattleTarget = useMemo(
    () => isCardInstanceBattleTarget(bottomLeaderCard, validBattleTargetsByCardId),
    [bottomLeaderCard, validBattleTargetsByCardId]
  );

  const battlefieldRowProps = {
    cards: cardOptions.topBattlefieldCards,
    validBattleTargetsByCardId,
    validSummonTargetsByCardId,
    selectedSummonTargetsByCardId,
    optimisticRestedByInstanceId,
    props,
  }

  const renderZoneCardSlotsProps = {
    cards: cardOptions.topBattlefieldCards,
    validBattleTargetsByCardId,
    validSummonTargetsByCardId,
    selectedSummonTargetsByCardId,
    props,
  }

  return (
    <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-0.5">
      <div
        ref={props.boardZoneRef}
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
              deckCardRef={props.topDeckCardRef}
              trashCardRef={props.topTrashCardRef}
            />
            <PlayTopResourceZone
              isSummonCardReady={props.derivedGameState.opponentPlayer?.isSummonCardReady ?? true}
            />
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-2">
            {renderZoneCardSlots({ ...renderZoneCardSlotsProps, zone: 'support', visibilityMode: 'hover', isCurrentPlayerZone: false })}
            {renderBattlefieldRow({
              ...battlefieldRowProps,
              cards: cardOptions.topBattlefieldCards,
              isCurrentPlayerZone: false,
              normalizedAttackLinkSourceCardId: cardOptions.normalizedAttackLinkSourceCardId,
              normalizedAttackLinkTargetCardId: cardOptions.normalizedAttackLinkTargetCardId,
            })}
          </div>

          <div className="flex min-h-0 w-full justify-end">
            <div
              className={twMerge(
                props.topLeaderCardFrameClassName,
                isTopLeaderBattleTarget ? 'battle-target-leader-top' : '',
                'relative overflow-visible',
              )}
            >
              <LeaderCard
                className="h-full"
                surfaceProps={{
                  id: cardOptions.topLeaderCard ? toAnchorId(cardOptions.topLeaderCard.instanceId) : undefined,
                  'data-card-instance-id': cardOptions.topLeaderCard?.instanceId,
                  'data-zone': 'leader-card',
                  'data-slot-side': 'top',
                  onClick: isTopLeaderBattleTarget && cardOptions.topLeaderCard ? () => props.onSelectAttackTarget(cardOptions.topLeaderCard!.instanceId) : undefined,
                  className: twMerge(
                    'h-full',
                    isTopLeaderBattleTarget ? 'cursor-pointer' : '',
                    cardOptions.normalizedAttackLinkSourceCardId.length > 0 && cardOptions.topLeaderCard && cardOptions.normalizedAttackLinkSourceCardId === cardOptions.topLeaderCard.instanceId.trim().toLowerCase()
                      ? 'attack-link-leader-outline'
                      : '',
                    cardOptions.normalizedAttackLinkTargetCardId.length > 0 && cardOptions.topLeaderCard && cardOptions.normalizedAttackLinkTargetCardId === cardOptions.topLeaderCard.instanceId.trim().toLowerCase()
                      ? 'attack-link-leader-outline'
                      : '',
                  ),
                }}
                imageClassName={LEADER_CARD_IMAGE_CLASS}
                hidePreviewButton={props.isBattleActionTargeting && Boolean(isTopLeaderBattleTarget)}
                leaderCard={cardOptions.topLeaderCard}
                previewCard={cardOptions.topLeaderCard ? (props.derivedGameState.cardById.get(cardOptions.topLeaderCard.cardDefinitionId.trim().toLowerCase()) ?? null) : null}
                showBadgeWhenLifeMissing
                actionOptions={cardOptions.topLeaderActionOptions}
                isConnected={props.isConnected}
                isActionPending={props.isActionPending}
                onSelectActionOption={(actionId) => {
                  const selectedAction = cardOptions.topLeaderActionOptions.find((action) => action.actionId === actionId)
                  if (!selectedAction) {
                    return
                  }

                  props.onSelectAction(selectedAction)
                }}
              />
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
            phaseTestId="phase-indicator"
          />
        </div>

        <div className="relative z-20 row-span-2 grid min-h-0 grid-cols-[var(--resource-rail-max-width)_minmax(0,1fr)_var(--resource-rail-max-width)] gap-1 rounded-xl p-0.5">
          <div className="min-h-0 w-full">
            <div
              className={twMerge(
                props.bottomLeaderCardFrameClassName,
                isBottomLeaderBattleTarget ? 'battle-target-leader-bottom' : '',
                'relative overflow-visible',
              )}
            >
              <LeaderCard
                className="h-full"
                surfaceProps={{
                  id: bottomLeaderCard ? toAnchorId(bottomLeaderCard.instanceId) : undefined,
                  'data-card-instance-id': bottomLeaderCard?.instanceId,
                  'data-zone': 'leader-card',
                  'data-slot-side': 'bottom',
                  onClick: isBottomLeaderBattleTarget && bottomLeaderCard ? () => props.onSelectAttackTarget(bottomLeaderCard.instanceId) : undefined,
                  className: twMerge(
                    'h-full',
                    isBottomLeaderBattleTarget ? 'cursor-pointer' : '',
                    cardOptions.normalizedAttackLinkSourceCardId.length > 0 && cardOptions.bottomLeaderCard && cardOptions.normalizedAttackLinkSourceCardId === cardOptions.bottomLeaderCard.instanceId.trim().toLowerCase()
                      ? 'attack-link-leader-outline'
                      : '',
                    cardOptions.normalizedAttackLinkTargetCardId.length > 0 && cardOptions.bottomLeaderCard && cardOptions.normalizedAttackLinkTargetCardId === cardOptions.bottomLeaderCard.instanceId.trim().toLowerCase()
                      ? 'attack-link-leader-outline'
                      : '',
                  ),
                }}
                imageClassName={LEADER_CARD_IMAGE_CLASS}
                hidePreviewButton={props.isBattleActionTargeting && Boolean(isBottomLeaderBattleTarget)}
                leaderCard={cardOptions.bottomLeaderCard}
                previewCard={cardOptions.bottomLeaderCard ? (props.derivedGameState.cardById.get(cardOptions.bottomLeaderCard.cardDefinitionId.trim().toLowerCase()) ?? null) : null}
                actionOptions={cardOptions.bottomLeaderActionOptions}
                isConnected={props.isConnected}
                isActionPending={props.isActionPending}
                onSelectActionOption={(actionId) => {
                  const selectedAction = cardOptions.bottomLeaderActionOptions.find((action) => action.actionId === actionId)
                  if (!selectedAction) {
                    return
                  }

                  props.onSelectAction(selectedAction)
                }}
              />
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
            {renderZoneCardSlots({ ...renderZoneCardSlotsProps, zone: 'support', visibilityMode: 'hover', isCurrentPlayerZone: true })}
          </div>

          <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
            <PlayBottomResourceZone
              isSummonCardReady={props.derivedGameState.currentPlayer?.isSummonCardReady ?? true}
            />
            <PlayPileZone
              side="bottom"
              labels={['Trash', 'Deck']}
              cardBackTone="orange"
              gameState={props.derivedGameState}
              deckCardRef={props.bottomDeckCardRef}
              trashCardRef={props.bottomTrashCardRef}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end justify-center gap-1">
        {props.joinCode ? (
          <div
            data-testid="game-join-code"
            className="mb-1 px-0.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-[0.45] [writing-mode:vertical-rl] rotate-180"
          >
            {props.joinCode}
          </div>
        ) : null}

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            data-testid="theme-toggle-button"
            onClick={props.onToggleTheme}
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
            data-testid="pass-turn-button"
            aria-label="Pass turn"
            onClick={props.onPassTurn}
            disabled={!props.isConnected || props.isActionPending}
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <SkipForward size={10} />
          </AppButton>
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            Do Nothing / Pass
          </span>
        </div>

        {props.pendingSetSupportCardInstanceId ? (
          <div className="group relative">
            <AppButton
              type="button"
              variant="ghost"
              aria-label="Cancel support slot selection"
              onClick={props.onCancelSetSupportSelection}
              className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
            >
              <span className="text-[10px] font-bold leading-none">X</span>
            </AppButton>
            <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
              Cancel Set Support
            </span>
          </div>
        ) : null}

        {props.isBattleActionTargeting ? (
          <div className="group relative">
            <AppButton
              type="button"
              variant="ghost"
              aria-label="Cancel attack target selection"
              onClick={props.onCancelAttackTargetSelection}
              className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
            >
              <span className="text-[10px] font-bold leading-none">X</span>
            </AppButton>
            <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
              Cancel Attack Target
            </span>
          </div>
        ) : null}

        {props.isSummonActionTargeting ? (
          <>
            <div className="group relative">
              <AppButton
                type="button"
                variant="ghost"
                aria-label="Confirm tribute selection"
                onClick={props.onConfirmSummonTargetSelection}
                disabled={!props.isConnected || props.isActionPending || !props.canConfirmSummonTargetSelection}
                className="h-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-1.5 py-0 text-[8px] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)]"
              >
                Go
              </AppButton>
              <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
                Confirm Tribute
              </span>
            </div>

            <div className="group relative">
              <AppButton
                type="button"
                variant="ghost"
                aria-label="Cancel tribute selection"
                onClick={props.onCancelSummonTargetSelection}
                className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
              >
                <span className="text-[10px] font-bold leading-none">X</span>
              </AppButton>
              <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
                Cancel Tribute
              </span>
            </div>
          </>
        ) : null}

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            aria-label="Undo action"
            disabled={!props.isConnected || props.isActionPending}
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
            disabled={!props.isConnected || props.isActionPending}
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