import { twMerge } from 'tailwind-merge'
import type { ILeaderCardProps } from '@/components/ui/types'
import type { IGameActionOptionResponse, IGameStateResponse } from '@/services/api/types/game'
import type { IGameZonesProps } from '@/views/game/types/gameZones'
import type { IAttackAnchorPosition, IAttackAnchorConfig, IBoardPoint, INonLeaderCardViewModel, ILeaderCardViewModel } from '@/views/game/types/viewModels'
import { LEADER_CARD_IMAGE_CLASS } from '@/views/game/utils/contants'
import { resolveCardActionOptionsForInstanceId, resolveNonLeaderCards } from '@/views/game/utils/functions/cards'

const ATTACK_HEAD_OFFSET_DEFAULT = 0.25
const ATTACK_HEAD_OFFSET_RESTED_RIGHT_TO_LEFT = 0.31
const ATTACK_HEAD_OFFSET_RESTED_LEFT_TO_RIGHT = 0.22

function withTargetGap(anchor: IAttackAnchorPosition, gap: number): IAttackAnchorConfig {
  if (anchor === 'left') {
    return {
      position: 'left',
      offset: { x: -gap, y: 0 },
    }
  }

  if (anchor === 'right') {
    return {
      position: 'right',
      offset: { x: gap, y: 0 },
    }
  }

  if (anchor === 'bottom') {
    return {
      position: 'bottom',
      offset: { x: 0, y: gap },
    }
  }

  return {
    position: 'top',
    offset: { x: 0, y: -gap },
  }
}

function withTargetGapAndHorizontalNudge(
  anchor: IAttackAnchorPosition,
  gap: number,
  horizontalNudge: number,
): IAttackAnchorConfig {
  if (anchor === 'left') {
    return {
      position: 'left',
      offset: { x: -gap + horizontalNudge, y: 0 },
    }
  }

  if (anchor === 'right') {
    return {
      position: 'right',
      offset: { x: gap + horizontalNudge, y: 0 },
    }
  }

  if (anchor === 'bottom') {
    return {
      position: 'bottom',
      offset: { x: horizontalNudge, y: gap },
    }
  }

  return {
    position: 'top',
    offset: { x: horizontalNudge, y: -gap },
  }
}

function getRotationRadians(element: HTMLElement): number {
  const transform = window.getComputedStyle(element).transform
  if (!transform || transform === 'none') {
    return 0
  }

  const matrixMatch = transform.match(/^matrix\(([^)]+)\)$/)
  if (matrixMatch) {
    const values = matrixMatch[1].split(',').map((value) => Number.parseFloat(value.trim()))
    if (values.length >= 2 && Number.isFinite(values[0]) && Number.isFinite(values[1])) {
      return Math.atan2(values[1], values[0])
    }
  }

  const matrix3dMatch = transform.match(/^matrix3d\(([^)]+)\)$/)
  if (matrix3dMatch) {
    const values = matrix3dMatch[1].split(',').map((value) => Number.parseFloat(value.trim()))
    if (values.length >= 2 && Number.isFinite(values[0]) && Number.isFinite(values[1])) {
      return Math.atan2(values[1], values[0])
    }
  }

  return 0
}

function getHorizontalVisualEdgeInset(element: HTMLElement): number {
  const layoutWidth = element.offsetWidth
  const layoutHeight = element.offsetHeight
  if (layoutWidth <= 0 || layoutHeight <= 0) {
    return 0
  }

  const angle = getRotationRadians(element)
  if (Math.abs(angle) < 0.001) {
    return 0
  }

  const absTan = Math.abs(Math.tan(angle))
  const intersectsVerticalSides = layoutWidth * absTan <= layoutHeight
  if (!intersectsVerticalSides) {
    return 0
  }

  const absCos = Math.abs(Math.cos(angle))
  if (absCos < 0.001) {
    return 0
  }

  const actualHalfWidthAtMidline = layoutWidth / (2 * absCos)
  const boundingHalfWidth = element.getBoundingClientRect().width * 0.5
  return Math.max(0, boundingHalfWidth - actualHalfWidthAtMidline)
}

function withSourceGap(anchor: IAttackAnchorPosition, gap: number): IAttackAnchorConfig {
  if (anchor === 'left') {
    return {
      position: 'left',
      offset: { x: -gap, y: 0 },
    }
  }

  if (anchor === 'right') {
    return {
      position: 'right',
      offset: { x: gap, y: 0 },
    }
  }

  if (anchor === 'bottom') {
    return {
      position: 'bottom',
      offset: { x: 0, y: gap },
    }
  }

  return {
    position: 'top',
    offset: { x: 0, y: -gap },
  }
}

function toAnchorId(instanceId: string): string {
  return `attack-anchor-${instanceId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`
}

function getElementCenter(element: HTMLElement): IBoardPoint {
  const rect = element.getBoundingClientRect()
  return {
    x: rect.left + rect.width * 0.5,
    y: rect.top + rect.height * 0.5,
  }
}

function getBattleTargetHighlightClass(side: 'top' | 'bottom'): string {
  return side === 'top' ? 'battle-target-top' : 'battle-target-bottom'
}

function getSummonTargetHighlightClass(side: 'top' | 'bottom'): string {
  return side === 'top'
    ? 'ring-2 ring-emerald-300/90 ring-offset-2 ring-offset-slate-900'
    : 'ring-2 ring-amber-300/90 ring-offset-2 ring-offset-slate-900'
}

function getCardsAndOptions(props: IGameZonesProps) {
    const { topLeaderCard, bottomLeaderCard } = props.derivedGameState

    const topSupportCards = resolveNonLeaderCards(
        props.derivedGameState.opponentPlayer?.supportZone ?? [],
        props.derivedGameState.cardTypeById,
        props.derivedGameState.cardById,
      )
      const topBattlefieldCards = resolveNonLeaderCards(
        props.topBattlefieldCardsOverride ?? props.derivedGameState.opponentPlayer?.characterField ?? [],
        props.derivedGameState.cardTypeById,
        props.derivedGameState.cardById,
      )
    
      const bottomSupportCards = resolveNonLeaderCards(
        props.derivedGameState.currentPlayer?.supportZone ?? [],
        props.derivedGameState.cardTypeById,
        props.derivedGameState.cardById,
      )
      const bottomBattlefieldCards = resolveNonLeaderCards(
        props.bottomBattlefieldCardsOverride ?? props.derivedGameState.currentPlayer?.characterField ?? [],
        props.derivedGameState.cardTypeById,
        props.derivedGameState.cardById,
      )
    
      const topLeaderActionOptions = topLeaderCard
        ? resolveCardActionOptionsForInstanceId(
          props.availableActions,
          topLeaderCard.instanceId,
          topLeaderCard.availableActions,
        )
        : []
      const bottomLeaderActionOptions = bottomLeaderCard
        ? resolveCardActionOptionsForInstanceId(
          props.availableActions,
          bottomLeaderCard.instanceId,
          bottomLeaderCard.availableActions,
        )
        : []
    
      const normalizedAttackLinkSourceCardId = props.activeAttackLink?.sourceCardInstanceId.trim().toLowerCase() ?? ''
      const normalizedAttackLinkTargetCardId = props.activeAttackLink?.targetCardInstanceId.trim().toLowerCase() ?? ''

      return {
        topLeaderCard,
        bottomLeaderCard,
        topSupportCards,
        topBattlefieldCards,
        bottomSupportCards,
        bottomBattlefieldCards,
        topLeaderActionOptions,
        bottomLeaderActionOptions,
        normalizedAttackLinkSourceCardId,
        normalizedAttackLinkTargetCardId,
      }
}

function buildLeaderCardProps(
  props: IGameZonesProps,
  config: {
    card: ILeaderCardViewModel | null
    slotSide: 'top' | 'bottom'
    isBattleTarget: boolean
    actionOptions: IGameActionOptionResponse[]
    showBadgeWhenLifeMissing?: boolean
  }
): ILeaderCardProps {
  const { card, slotSide, isBattleTarget, actionOptions, showBadgeWhenLifeMissing = false } = config
  const normalizedInstanceId = card?.instanceId.trim().toLowerCase()
  const normalizedAttackLinkSourceCardId = props.activeAttackLink?.sourceCardInstanceId.trim().toLowerCase() ?? ''
  const normalizedAttackLinkTargetCardId = props.activeAttackLink?.targetCardInstanceId.trim().toLowerCase() ?? ''
  const isAttackLinkEndpoint =
    Boolean(normalizedInstanceId) &&
    (normalizedInstanceId === normalizedAttackLinkSourceCardId ||
      normalizedInstanceId === normalizedAttackLinkTargetCardId)

  return {
    className: 'h-full',
    surfaceProps: {
      id: card ? toAnchorId(card.instanceId) : undefined,
      'data-card-instance-id': card?.instanceId,
      'data-zone': 'leader-card',
      'data-slot-side': slotSide,
      onClick: isBattleTarget && card ? () => props.onSelectAttackTarget(card.instanceId) : undefined,
      className: twMerge(
        'h-full',
        isBattleTarget ? 'cursor-pointer' : '',
        isAttackLinkEndpoint ? 'attack-link-leader-outline' : ''
      ),
    },
    imageClassName: LEADER_CARD_IMAGE_CLASS,
    hidePreviewButton: props.isBattleActionTargeting && isBattleTarget,
    leaderCard: card,
    previewCard: card ? (props.derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null) : null,
    showBadgeWhenLifeMissing,
    actionOptions,
    isConnected: props.isConnected,
    isActionPending: props.isActionPending,
    onSelectActionOption: (actionId) => {
      const selectedAction = actionOptions.find((action) => action.actionId === actionId)
      if (selectedAction) {
        props.onSelectAction(selectedAction)
      }
    },
  }
}

const isMatchingInstance = (targetId: string, cardId: string) =>
  targetId.length > 0 && targetId === cardId;

const isCardRestedState = (card: INonLeaderCardViewModel | ILeaderCardViewModel, optimisticRested: Record<string, boolean>) =>
  card.isRested || card.isExhausted || optimisticRested[card.instanceId] === true;

function extractTargetIds(targets?: Array<{ cardInstanceId: string }> | null): Set<string> {
  const targetIds = new Set<string>();
  if (!targets) return targetIds;
  
  for (const target of targets) {
    if (target?.cardInstanceId) {
      targetIds.add(target.cardInstanceId.trim().toLowerCase());
    }
  }
  return targetIds;
};

function isCardInstanceBattleTarget(card: ILeaderCardViewModel | null, validTargets: Set<string>): boolean {
  if (!card) return false;
  return validTargets.has(card.instanceId.trim().toLowerCase());
};

function computeCardDisplayFlags(
  card: INonLeaderCardViewModel,
  zone: string,
  isCurrentPlayerZone: boolean,
  gameState: IGameStateResponse,
  validBattleTargetsByCardId: Set<string>,
  validSummonTargetsByCardId: Set<string>,
  selectedSummonTargetsByCardId: Set<string>,
  normalizedAttackLinkSourceCardId: string,
  normalizedAttackLinkTargetCardId: string,
  optimisticRestedByInstanceId: Record<string, boolean>,
  isSelectionBlocked: boolean
) {
  const normalizedCardId = card.instanceId.trim().toLowerCase();

  const targetFlags = {
    isBattleTarget: validBattleTargetsByCardId.has(normalizedCardId),
    isSummonTarget: validSummonTargetsByCardId.has(normalizedCardId),
    isSelectedSummonTarget: selectedSummonTargetsByCardId.has(normalizedCardId),
    isAttackLinkSource: isMatchingInstance(normalizedAttackLinkSourceCardId, normalizedCardId),
    isAttackLinkTarget: isMatchingInstance(normalizedAttackLinkTargetCardId, normalizedCardId),
    isSelectionBlocked,
  };

  const isRested = isCardRestedState(card, optimisticRestedByInstanceId);
  const shouldDelayRestedDimming = Boolean(gameState.isAttackSequencePending) && targetFlags.isAttackLinkSource;

  return {
    targetFlags,
    shouldDimRestedCard: isRested && !shouldDelayRestedDimming,
    isOwnConcealedSupport: zone === 'support' && isCurrentPlayerZone && card.isConcealedFromOpponent === true,
    isConcealedSupport: zone === 'support' && !isCurrentPlayerZone && !card.isFaceUp,
  };
};

function resolveAttackAnchorConfig(
  sourceCard: HTMLElement,
  targetCard: HTMLElement,
  isTargetRested: boolean
) {
  const sourceCenter = getElementCenter(sourceCard);
  const targetCenter = getElementCenter(targetCard);
  const sourceSlotSide = sourceCard.getAttribute('data-slot-side');
  
  const startAnchor: IAttackAnchorPosition = sourceSlotSide === 'top' ? 'bottom' : 'top';
  const endAnchor: IAttackAnchorPosition = sourceCenter.x <= targetCenter.x ? 'left' : 'right';
  const isRightToLeftAttack = sourceCenter.x > targetCenter.x;

  const horizontalVisualEdgeInset = getHorizontalVisualEdgeInset(targetCard);
  const resolvedTargetAnchorNudge = horizontalVisualEdgeInset === 0 
    ? 0 
    : (endAnchor === 'left' ? horizontalVisualEdgeInset : -horizontalVisualEdgeInset);

  const resolvedHeadOffsetForward = isTargetRested
    ? (isRightToLeftAttack ? ATTACK_HEAD_OFFSET_RESTED_RIGHT_TO_LEFT : ATTACK_HEAD_OFFSET_RESTED_LEFT_TO_RIGHT)
    : ATTACK_HEAD_OFFSET_DEFAULT;

  const sourceRect = sourceCard.getBoundingClientRect();
  const targetRect = targetCard.getBoundingClientRect();
  const alignedThreshold = Math.max(12, Math.min(sourceRect.width, targetRect.width) * 0.18);
  const isVerticallyAligned = Math.abs(sourceCenter.x - targetCenter.x) <= alignedThreshold;

  return {
    startAnchor,
    endAnchor,
    resolvedTargetAnchorNudge,
    resolvedHeadOffsetForward,
    isVerticallyAligned,
    sourceCenter,
    targetCenter,
  };
};

export {
  resolveAttackAnchorConfig,
  computeCardDisplayFlags,
  extractTargetIds,
  isCardInstanceBattleTarget,
  withTargetGap,
  withTargetGapAndHorizontalNudge,
  withSourceGap,
  toAnchorId,
  getElementCenter,
  getBattleTargetHighlightClass,
  getSummonTargetHighlightClass,
  getHorizontalVisualEdgeInset,
  getCardsAndOptions,
  buildLeaderCardProps,
  isMatchingInstance,
  isCardRestedState,
}