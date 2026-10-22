import { twMerge } from 'tailwind-merge'
import type { ILeaderCardProps } from '@/components/ui/types'
import type { IGameActionOptionResponse, IGameStateResponse } from '@/services/api/types/game'
import type { IGameZonesProps, IAttackAnchorPosition, IAttackAnchorConfig, IAttackLinkCubic, IAttackLinkGeometry, IAttackLinkGeometryOptions, IAttackLinkHeadConfig, IBoardPoint, IAttackFlowLinkState, INonLeaderCardViewModel, ILeaderCardViewModel } from '@/views/game/types'
import {
  ATTACK_ARROW_HEAD_LENGTH_PX,
  ATTACK_LINK_DASH_GAP_PX,
  ATTACK_LINK_DASH_LENGTH_PX,
  LEADER_CARD_IMAGE_CLASS,
} from '@/views/game/utils/contants'
import { resolveCardActionOptionsForInstanceId, resolveNonLeaderCards } from '@/views/game/utils/functions/cards'
import { resolveAttackAnchorPoint, resolveAttackLinkCubic } from './attackLinkCurve'

const LEADER_RESTED_ROTATION_CLASS = 'rotate-[5deg]'

function getRotationRadians(element: HTMLElement): number {
  let current: HTMLElement | null = element
  while (current) {
    const angle = getOwnRotationRadians(current)
    if (angle !== 0) {
      return angle
    }
    current = current.parentElement
  }

  return 0
}

function getOwnRotationRadians(element: HTMLElement): number {
  const style = window.getComputedStyle(element)

  const standaloneRotate = style.rotate
  if (standaloneRotate && standaloneRotate !== 'none') {
    const angleMatch = standaloneRotate.match(/(-?[\d.]+)deg/)
    if (angleMatch) {
      return (Number.parseFloat(angleMatch[1]) * Math.PI) / 180
    }
  }

  const transform = style.transform
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

function getHorizontalVisualEdgeOffset(element: HTMLElement, side: 'left' | 'right'): IBoardPoint {
  const layoutWidth = element.offsetWidth
  const layoutHeight = element.offsetHeight
  if (layoutWidth <= 0 || layoutHeight <= 0) {
    return { x: 0, y: 0 }
  }

  const angle = getRotationRadians(element)
  if (Math.abs(angle) < 0.001) {
    return { x: 0, y: 0 }
  }

  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const halfWidth = layoutWidth * 0.5
  const halfHeight = layoutHeight * 0.5
  const bboxHalfWidth = halfWidth * Math.abs(cos) + halfHeight * Math.abs(sin)
  const inwardOffset = bboxHalfWidth - halfWidth * cos
  const visualEdgeMidpointY = halfWidth * sin

  if (side === 'left') {
    return { x: inwardOffset, y: -visualEdgeMidpointY }
  }

  return { x: -inwardOffset, y: visualEdgeMidpointY }
}

function getVerticalVisualEdgeOffset(element: HTMLElement, side: 'top' | 'bottom'): IBoardPoint {
  const layoutWidth = element.offsetWidth
  const layoutHeight = element.offsetHeight
  if (layoutWidth <= 0 || layoutHeight <= 0) {
    return { x: 0, y: 0 }
  }

  const angle = getRotationRadians(element)
  if (Math.abs(angle) < 0.001) {
    return { x: 0, y: 0 }
  }

  const sin = Math.sin(angle)
  const sinHalfHeight = layoutHeight * 0.5 * sin
  const sinHalfWidth = layoutWidth * 0.5 * sin

  if (side === 'top') {
    return { x: sinHalfHeight, y: sinHalfWidth }
  }

  return { x: -sinHalfHeight, y: -sinHalfWidth }
}

function withAnchorGap(
  anchor: IAttackAnchorPosition,
  gap: number,
  visualOffset: IBoardPoint = { x: 0, y: 0 }
): IAttackAnchorConfig {
  if (anchor === 'left') {
    return {
      position: 'left',
      offset: { x: -gap + visualOffset.x, y: visualOffset.y },
    }
  }

  if (anchor === 'right') {
    return {
      position: 'right',
      offset: { x: gap + visualOffset.x, y: visualOffset.y },
    }
  }

  if (anchor === 'bottom') {
    return {
      position: 'bottom',
      offset: { x: visualOffset.x, y: gap + visualOffset.y },
    }
  }

  return {
    position: 'top',
    offset: { x: visualOffset.x, y: -gap + visualOffset.y },
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

function getLeaderBattleTargetHighlightClass(side: 'top' | 'bottom'): string {
  return side === 'top' ? 'battle-target-leader-top' : 'battle-target-leader-bottom'
}

function getSummonTargetHighlightClass(side: 'top' | 'bottom'): string {
  return side === 'top'
    ? 'ring-2 ring-emerald-300/90 ring-offset-2 ring-offset-slate-900'
    : 'ring-2 ring-amber-300/90 ring-offset-2 ring-offset-slate-900'
}

function getCardsAndOptions(props: IGameZonesProps, attackLink: IAttackFlowLinkState | null) {
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
    
      const normalizedAttackLinkSourceCardId = attackLink?.sourceCardInstanceId.trim().toLowerCase() ?? ''
      const normalizedAttackLinkTargetCardId = attackLink?.targetCardInstanceId.trim().toLowerCase() ?? ''

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
    activeAttackLink?: IAttackFlowLinkState | null
    hidePreviewWhenBattleTarget?: boolean
    showBadgeWhenLifeMissing?: boolean
    isRested?: boolean
    isEffectTargetCandidate?: boolean
    onToggleEffectTarget?: () => void
  }
): ILeaderCardProps {
  const {
    card,
    slotSide,
    isBattleTarget,
    actionOptions,
    activeAttackLink = null,
    hidePreviewWhenBattleTarget = false,
    showBadgeWhenLifeMissing = false,
    isRested = false,
    isEffectTargetCandidate = false,
    onToggleEffectTarget,
  } = config
  const normalizedInstanceId = card?.instanceId.trim().toLowerCase()
  const normalizedAttackLinkSourceCardId = activeAttackLink?.sourceCardInstanceId.trim().toLowerCase() ?? ''
  const normalizedAttackLinkTargetCardId = activeAttackLink?.targetCardInstanceId.trim().toLowerCase() ?? ''
  const isAttackLinkSource =
    Boolean(normalizedInstanceId) && normalizedInstanceId === normalizedAttackLinkSourceCardId
  const isAttackLinkEndpoint =
    Boolean(normalizedInstanceId) &&
    (normalizedInstanceId === normalizedAttackLinkSourceCardId ||
      normalizedInstanceId === normalizedAttackLinkTargetCardId)
  const shouldDimRestedCard =
    isRested && !(Boolean(props.gameState.isAttackSequencePending) && isAttackLinkSource)

  return {
    className: 'h-full',
    surfaceProps: {
      id: card ? toAnchorId(card.instanceId) : undefined,
      'data-card-instance-id': card?.instanceId,
      'data-zone': 'leader-card',
      'data-slot-side': slotSide,
      className: twMerge(
        'h-full transition-transform duration-300 ease-out origin-center',
        isRested ? LEADER_RESTED_ROTATION_CLASS : 'rotate-0',
        shouldDimRestedCard ? 'opacity-80 saturate-75' : '',
        isAttackLinkEndpoint ? 'attack-link-leader-outline' : '',
        isBattleTarget ? getLeaderBattleTargetHighlightClass(slotSide) : ''
      ),
    },
    imageClassName: LEADER_CARD_IMAGE_CLASS,
    hidePreviewButton: hidePreviewWhenBattleTarget && isBattleTarget,
    isTargetCandidate: isBattleTarget,
    onChooseTarget: card ? () => props.onSelectAttackTarget(card.instanceId) : undefined,
    isEffectTargetCandidate,
    onToggleEffectTarget,
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
  card.isRested || optimisticRested[card.instanceId] === true;

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

function isCardInstanceInTargetSet(card: ILeaderCardViewModel | null, validTargets: Set<string>): boolean {
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
    isConcealedSupport: zone === 'support' && !isCurrentPlayerZone && !card.isFaceUp && !card.isRevealed,
  };
};

function resolveAttackAnchorSides(
  sourceCard: HTMLElement,
  targetCard: HTMLElement,
  targetGapPx: number
) {
  const sourceCenter = getElementCenter(sourceCard);
  const targetCenter = getElementCenter(targetCard);
  const sourceSlotSide = sourceCard.getAttribute('data-slot-side');

  const startAnchor: IAttackAnchorPosition = sourceSlotSide === 'top' ? 'bottom' : 'top';

  const sourceAnchorX = sourceCenter.x;
  const targetRect = targetCard.getBoundingClientRect();
  const targetAnchorOffsets = {
    left: getHorizontalVisualEdgeOffset(targetCard, 'left'),
    right: getHorizontalVisualEdgeOffset(targetCard, 'right'),
  };
  const leftAnchorX = targetRect.left - targetGapPx + targetAnchorOffsets.left.x;
  const rightAnchorX = targetRect.right + targetGapPx + targetAnchorOffsets.right.x;
  const canApproachFromLeft = sourceAnchorX < leftAnchorX;
  const canApproachFromRight = sourceAnchorX > rightAnchorX;
  const prefersLeft = sourceCenter.x <= targetCenter.x;

  const endAnchorSide: 'left' | 'right' | null = canApproachFromLeft && (prefersLeft || !canApproachFromRight)
    ? 'left'
    : canApproachFromRight
      ? 'right'
      : null;

  const sourceRect = sourceCard.getBoundingClientRect();
  const alignedThreshold = Math.max(12, Math.min(sourceRect.width, targetRect.width) * 0.18);
  const isVerticallyAligned = Math.abs(sourceCenter.x - targetCenter.x) <= alignedThreshold;

  return {
    startAnchor,
    endAnchorSide,
    isVerticallyAligned,
    sourceCenter,
    targetCenter,
  };
};

function resolveAttackLinkGeometry(
  sourceCard: HTMLElement,
  targetCard: HTMLElement,
  boardElement: HTMLElement,
  options: IAttackLinkGeometryOptions
): IAttackLinkGeometry {
  const boardRect = boardElement.getBoundingClientRect();
  const sides = resolveAttackAnchorSides(sourceCard, targetCard, options.targetGapPx);
  const boardCenterX = boardRect.left + boardRect.width * 0.5;

  if (sides.isVerticallyAligned || sides.endAnchorSide === null) {
    const linkCenterX = (sides.sourceCenter.x + sides.targetCenter.x) * 0.5;
    const inwardSide: 'left' | 'right' = linkCenterX <= boardCenterX ? 'right' : 'left';
    const sideBend = inwardSide === 'right' ? options.sideBendPx : -options.sideBendPx;

    return {
      startAnchor: withAnchorGap(
        inwardSide,
        options.sweepSourceGapPx,
        getHorizontalVisualEdgeOffset(sourceCard, inwardSide)
      ),
      endAnchor: withAnchorGap(
        inwardSide,
        options.sweepTargetGapPx,
        getHorizontalVisualEdgeOffset(targetCard, inwardSide)
      ),
      sweepBendPx: sideBend,
    };
  }

  return {
    startAnchor: withAnchorGap(
      sides.startAnchor,
      options.sourceGapPx,
      getVerticalVisualEdgeOffset(sourceCard, sides.startAnchor)
    ),
    endAnchor: withAnchorGap(
      sides.endAnchorSide,
      options.targetGapPx,
      getHorizontalVisualEdgeOffset(targetCard, sides.endAnchorSide)
    ),
  };
}


function resolveAttackLinkPathData(cubic: IAttackLinkCubic): string {
  return `M ${cubic.start.x} ${cubic.start.y} `
    + `C ${cubic.control1.x} ${cubic.control1.y}, `
    + `${cubic.control2.x} ${cubic.control2.y}, `
    + `${cubic.end.x} ${cubic.end.y}`
}

const ATTACK_LINK_LENGTH_SAMPLES = 32

function resolveAttackLinkPathLength(cubic: IAttackLinkCubic): number {
  let length = 0
  let previousX = cubic.start.x
  let previousY = cubic.start.y

  for (let index = 1; index <= ATTACK_LINK_LENGTH_SAMPLES; index += 1) {
    const t = index / ATTACK_LINK_LENGTH_SAMPLES
    const u = 1 - t
    const x = u * u * u * cubic.start.x
      + 3 * u * u * t * cubic.control1.x
      + 3 * u * t * t * cubic.control2.x
      + t * t * t * cubic.end.x
    const y = u * u * u * cubic.start.y
      + 3 * u * u * t * cubic.control1.y
      + 3 * u * t * t * cubic.control2.y
      + t * t * t * cubic.end.y

    length += Math.hypot(x - previousX, y - previousY)
    previousX = x
    previousY = y
  }

  return length
}

function resolveAttackLinkDashOffset(cubic: IAttackLinkCubic): number {
  const period = ATTACK_LINK_DASH_LENGTH_PX + ATTACK_LINK_DASH_GAP_PX
  const dashEndsAt = resolveAttackLinkPathLength(cubic) - ATTACK_LINK_DASH_GAP_PX
  const offset = (ATTACK_LINK_DASH_LENGTH_PX - dashEndsAt) % period

  return offset < 0 ? offset + period : offset
}

function resolveAttackLinkHeadConfig(cubic: IAttackLinkCubic): IAttackLinkHeadConfig {
  const directionX = cubic.end.x - cubic.control2.x
  const directionY = cubic.end.y - cubic.control2.y
  const directionLength = Math.hypot(directionX, directionY)
  const headLengthPx = ATTACK_ARROW_HEAD_LENGTH_PX

  if (directionLength < 0.001) {
    return { x: cubic.end.x, y: cubic.end.y, rotationDeg: 0, sizePx: headLengthPx }
  }

  const unitX = directionX / directionLength
  const unitY = directionY / directionLength

  return {
    x: cubic.end.x - unitX * headLengthPx,
    y: cubic.end.y - unitY * headLengthPx,
    rotationDeg: (Math.atan2(unitY, unitX) * 180) / Math.PI,
    sizePx: headLengthPx,
  }
}

export {
  resolveAttackLinkGeometry,
  resolveAttackAnchorPoint,
  resolveAttackLinkCubic,
  resolveAttackLinkPathData,
  resolveAttackLinkDashOffset,
  resolveAttackLinkHeadConfig,
  computeCardDisplayFlags,
  extractTargetIds,
  isCardInstanceInTargetSet,
  toAnchorId,
  getElementCenter,
  getBattleTargetHighlightClass,
  getSummonTargetHighlightClass,
  getCardsAndOptions,
  buildLeaderCardProps,
  isMatchingInstance,
  isCardRestedState,
}