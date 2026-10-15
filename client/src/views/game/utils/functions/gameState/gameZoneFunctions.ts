import { twMerge } from 'tailwind-merge'
import type { ILeaderCardProps } from '@/components/ui/types'
import type { IGameActionOptionResponse, IGameStateResponse } from '@/services/api/types/game'
import type { IGameZonesProps, IAttackAnchorPosition, IAttackAnchorConfig, IAttackLinkCubic, IAttackLinkGeometry, IAttackLinkGeometryOptions, IAttackLinkHeadConfig, IBoardPoint, IAttackFlowLinkState, INonLeaderCardViewModel, ILeaderCardViewModel } from '@/views/game/types'
import {
  ATTACK_ARROW_HEAD_LENGTH_PX,
  ATTACK_LINK_ARC_DEPTH_FACTOR,
  ATTACK_LINK_ARC_MAX_DEPTH_PX,
  ATTACK_LINK_ARC_MIN_DEPTH_PX,
  ATTACK_LINK_DASH_GAP_PX,
  ATTACK_LINK_DASH_LENGTH_PX,
  LEADER_CARD_IMAGE_CLASS,
} from '@/views/game/utils/contants'
import { resolveCardActionOptionsForInstanceId, resolveNonLeaderCards } from '@/views/game/utils/functions/cards'

// Leaders sit in a fixed frame against the board edge, so they get a gentler rested tilt than the
// freely-arranged battlefield characters (which use 14deg in BattleFieldRow).
const LEADER_RESTED_ROTATION_CLASS = 'rotate-[5deg]'

// The card's tilt may be applied on the element itself (a Tailwind `rotate-[…deg]` class) or, now that Motion
// owns the board card's transform, on a wrapper element. Walk up from the card until a rotation is found so the
// visual-edge compensation below follows the tilt wherever it is applied; a pure translate/scale ancestor
// yields a zero angle and the walk simply continues.
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

  // Tailwind v4 emits `rotate-[14deg]` / `rotate-[5deg]` as the standalone `rotate` property, so the
  // rested tilt of a card is invisible to a `transform`-only read. Missing this made every visual-edge
  // anchor compensation below a no-op (the anchors stayed out at the bounding-box corner).
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

// An anchor is the element's *bounding box* edge midpoint for its side, so for a rotated card it floats
// off the card: the bbox edge midpoint sits out at the rotated card's corner. These two helpers return
// the offset that maps an anchor back onto the midpoint of the card's *visual* edge (the layout edge
// midpoint mapped through the element's rotation).
//
// Both components matter. The old horizontal version only nudged x (back onto the tilted edge at the
// card's centre height), which left the anchor level with the card's centre - i.e. visibly *below* the
// tilted edge's midpoint by (w/2)·sin(angle) (~10px on a rested 79px-wide card). That vertical half is
// exactly the "arrow meets a tilted card slightly low" offset.
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
  // The bounding box of a rotated w×h box is (w·|cos| + h·|sin|) × (h·|cos| + w·|sin|), centred on the
  // card, so its horizontal edge sits this far out from the card's centre.
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

  // Local edge midpoint (0, -h/2) for `top` and (0, +h/2) for `bottom`, rotated about the card centre.
  const sin = Math.sin(angle)
  const sinHalfHeight = layoutHeight * 0.5 * sin
  const sinHalfWidth = layoutWidth * 0.5 * sin

  if (side === 'top') {
    return { x: sinHalfHeight, y: sinHalfWidth }
  }

  return { x: -sinHalfHeight, y: -sinHalfWidth }
}

// Anchor config for a side + gap + visual-edge offset: `gap` is applied perpendicular to the side and the
// offset slides the anchor onto the card's visual edge (zero for an untilted card, so the resting look is
// unchanged).
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

// Applied on the leader card surface (not the frame) so the highlight rotates with the rested tilt
// and hugs the card, exactly like battlefield rows.
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
    /** True while this leader is one of an effect selection prompt's candidates (N-013's freeze). */
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
  // Mirror the battlefield row: keep a rested attack-link source undimmed until the sequence ends
  // so the arrow anchor does not visually change while the attack resolves.
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

/**
 * Whether the card's instance id is in a normalized target-id set. Shared by the leader's battle-target and
 * effect-target/prompt-candidate flags, so the two highlights can never drift apart.
 */
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

// The tail's horizontal end anchor can only be used when the *source* sits beyond that anchor point:
// the end tangent follows sign(endAnchorX - startAnchorX), so an anchor picked by comparing card centres
// can put the tail on the far side of the target, making it travel *out* of the card. The horizontal
// anchor is the bbox's left/right edge midpoint nudged back onto the card's visual edge (see
// `getHorizontalVisualEdgeOffset`).
// Decides which edges the tail leaves/enters from. It deliberately returns *sides* (plus the raw anchor
// offsets the approach test needs) rather than finished anchors: the visual-edge offsets are applied by
// `resolveAttackLinkGeometry`, which has the elements and re-runs on every layout sample.
function resolveAttackAnchorSides(
  sourceCard: HTMLElement,
  targetCard: HTMLElement,
  targetGapPx: number
) {
  const sourceCenter = getElementCenter(sourceCard);
  const targetCenter = getElementCenter(targetCard);
  const sourceSlotSide = sourceCard.getAttribute('data-slot-side');

  const startAnchor: IAttackAnchorPosition = sourceSlotSide === 'top' ? 'bottom' : 'top';

  // The start anchor sits on the source's vertical edge, so its x is the source's centre x.
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

  // null = the source overlaps the target horizontally, so no side is approachable: the caller falls
  // back to the sweeping path, which always hooks into its anchor from the outside.
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

// The board's attack link geometry, re-derived from the live elements: anchors are bounding-box edge
// midpoints, so every anchor on a tilted (rested) card - and the source is *always* tilted, because the
// attacker rests on declaration - has to be pulled back onto the card's visual edge. A tilted card's box
// also keeps moving while its tilt animates, so this runs on every layout sample instead of once per
// render (see `AttackLinkArrow`).
function resolveAttackLinkGeometry(
  sourceCard: HTMLElement,
  targetCard: HTMLElement,
  boardElement: HTMLElement,
  options: IAttackLinkGeometryOptions
): IAttackLinkGeometry {
  const boardRect = boardElement.getBoundingClientRect();
  const sides = resolveAttackAnchorSides(sourceCard, targetCard, options.targetGapPx);
  const boardCenterX = boardRect.left + boardRect.width * 0.5;

  // The sweeping path is used when the cards are stacked (no clear side to enter from) or when the
  // source overlaps the target horizontally, so neither horizontal anchor can be approached from the
  // outside. It always hooks into the target's side from beyond it, so the dashes travel into the card
  // and the head continues them instead of fighting them.
  if (sides.isVerticallyAligned || sides.endAnchorSide === null) {
    const linkCenterX = (sides.sourceCenter.x + sides.targetCenter.x) * 0.5;
    const inwardSide: 'left' | 'right' = linkCenterX <= boardCenterX ? 'right' : 'left';
    const sideBend = inwardSide === 'right' ? options.sideBendPx : -options.sideBendPx;

    return {
      // This branch anchors the source on its horizontal edge too, so the source gets exactly the same
      // visual-edge treatment as the target (the attacker is always rested here).
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
      curveness: 0.86,
      controlPointOffsets: { cpx1: sideBend, cpx2: sideBend * 1.25 },
    };
  }

  return {
    // The attacker rests on declaration, so the source is (nearly always) tilted: anchoring on the
    // vertical edge *midpoint* keeps the tail's start on the card instead of out at its box corner.
    startAnchor: withAnchorGap(
      sides.startAnchor,
      options.sourceGapPx,
      getVerticalVisualEdgeOffset(sourceCard, sides.startAnchor)
    ),
    // Same for the target's horizontal edge: using only the horizontal half of this offset left the
    // arrow level with the card's centre, i.e. visibly below the tilted edge's midpoint.
    endAnchor: withAnchorGap(
      sides.endAnchorSide,
      options.targetGapPx,
      getHorizontalVisualEdgeOffset(targetCard, sides.endAnchorSide)
    ),
    curveness: 0.68,
    // Nothing arc-specific travels with this branch: not carrying `controlPointOffsets` is what makes it the arc,
    // and `resolveAttackLinkCubic` derives the bow's depth and side from the chord itself. Both handles used to sit
    // *on* the chord here, which draws a dead straight line: rigid, and it sliced diagonally across whatever
    // occupies the board's middle - the phase action row is a full-width grid row between the two halves, so every
    // attack crosses it (that is the banner the report saw, e.g. "Opponent Support Cut-In").
  };
}

// ---------------------------------------------------------------------------------------------
// Rendering the link ourselves.
//
// These four helpers turn the geometry above into the shapes the board draws - the dashed tail as a cubic
// Bézier and the arrowhead from that same cubic. The anchor configs keep the hard-won visual-edge maths
// (the whole point of the code above), while the curve and the head come from those same control points,
// so nothing has to be measured back out of a rendered path.
// ---------------------------------------------------------------------------------------------

type IAttackLinkRect = {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The point an anchor config names: the *bounding box* edge midpoint for its side, then the config's own
 * offset. That is the anchor contract the geometry above was tuned against.
 */
function resolveAttackAnchorPoint(anchor: IAttackAnchorConfig, rect: IAttackLinkRect): IBoardPoint {
  // The anchor config is a union that also accepts a bare side name. Our own geometry always builds the
  // object form, so a bare name is normalised to it here (no offset), which keeps this the single place
  // that knows how a side maps onto a box.
  if (typeof anchor === 'string') {
    return resolveAttackAnchorPoint({ position: anchor, offset: { x: 0, y: 0 } }, rect)
  }

  const centerX = rect.left + rect.width * 0.5
  const centerY = rect.top + rect.height * 0.5

  switch (anchor.position) {
    case 'top':
      return { x: centerX + anchor.offset.x, y: rect.top + anchor.offset.y }
    case 'bottom':
      return { x: centerX + anchor.offset.x, y: rect.top + rect.height + anchor.offset.y }
    case 'left':
      return { x: rect.left + anchor.offset.x, y: centerY + anchor.offset.y }
    default:
      return { x: rect.left + rect.width + anchor.offset.x, y: centerY + anchor.offset.y }
  }
}

/**
 * The tail as a cubic Bézier - the one shape both branches produce, so everything downstream (the path data and
 * the head, which reads `control2`) works off the same curve.
 *
 * The sweep keeps its hook: the first handle is pushed sideways by a fixed pixel amount (it has to clear a whole
 * card) and the second stays on the start→end chord, which is what makes the tail arrive travelling into the card
 * from beyond it.
 *
 * The flat case is the arc it is specified as: a quadratic with exactly one control point, `ATTACK_LINK_ARC_*` off
 * the chord's *midpoint* and perpendicular to it, mirrored by `sign(deltaX)` so the bow lands on the same visual
 * side whichever way the pair happens to be laid out. It is written out as the equivalent cubic (control points at
 * two thirds of the way from each end to the quadratic's control point), which is the same curve, and which keeps
 * the head derivation exact: `end - control2` is then the quadratic's own end tangent, so the head continues the
 * arc instead of fighting it. Because the arc is symmetric, the tail leaves the source and arrives at the target at
 * the same angle - the kinked, lopsided look a bow on one handle alone produces is gone.
 */
function resolveAttackLinkCubic(
  geometry: IAttackLinkGeometry,
  sourceRect: IAttackLinkRect,
  targetRect: IAttackLinkRect,
): IAttackLinkCubic {
  const start = resolveAttackAnchorPoint(geometry.startAnchor, sourceRect)
  const end = resolveAttackAnchorPoint(geometry.endAnchor, targetRect)
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y
  const chordLength = Math.hypot(deltaX, deltaY)
  const normalX = chordLength > 0 ? -deltaY / chordLength : 0
  const normalY = chordLength > 0 ? deltaX / chordLength : 0

  if (geometry.controlPointOffsets) {
    const bend = geometry.controlPointOffsets.cpx1
    const pull = geometry.curveness

    return {
      start,
      control1: {
        x: start.x + deltaX * pull * 0.4 + normalX * bend,
        y: start.y + deltaY * pull * 0.4 + normalY * bend,
      },
      control2: {
        x: end.x - deltaX * pull * 0.6,
        y: end.y - deltaY * pull * 0.6,
      },
      end,
    }
  }

  // Responsive depth, clamped into a fixed pixel band.
  const arcDepth = Math.min(
    Math.max(chordLength * ATTACK_LINK_ARC_DEPTH_FACTOR, ATTACK_LINK_ARC_MIN_DEPTH_PX),
    ATTACK_LINK_ARC_MAX_DEPTH_PX,
  )
  // ...and a side chosen from *both* ends of the link, because "the wide side" is not a property of the target
  // alone: the arc lobs *towards the card it is aimed at*, so it bows above the chord when the link climbs the
  // board (the viewer's own half is at the bottom, so that is every attack they declare) and below it when the
  // link descends (the opponent's attack, or a leader striking down into the battlefield). Which perpendicular
  // that is also flips with the target's side, since a perpendicular to an up-left chord points up-right or
  // down-left - the sign below picks the one whose vertical component points the way the link travels. Reversing a
  // link therefore mirrors its arc across the chord, so an attack and the counter-attack read as the same shot
  // seen from opposite ends of the table, and the arc always turns *into* the card it lands on.
  const bowsUpward = deltaY <= 0
  const directionMultiplier = (deltaX > 0) === bowsUpward ? -1 : 1
  const control = {
    x: (start.x + end.x) * 0.5 + normalX * arcDepth * directionMultiplier,
    y: (start.y + end.y) * 0.5 + normalY * arcDepth * directionMultiplier,
  }

  return {
    start,
    control1: {
      x: start.x + (2 / 3) * (control.x - start.x),
      y: start.y + (2 / 3) * (control.y - start.y),
    },
    control2: {
      x: end.x + (2 / 3) * (control.x - end.x),
      y: end.y + (2 / 3) * (control.y - end.y),
    },
    end,
  }
}

function resolveAttackLinkPathData(cubic: IAttackLinkCubic): string {
  return `M ${cubic.start.x} ${cubic.start.y} `
    + `C ${cubic.control1.x} ${cubic.control1.y}, `
    + `${cubic.control2.x} ${cubic.control2.y}, `
    + `${cubic.end.x} ${cubic.end.y}`
}

// Segments used to integrate the cubic's length below. The dash pattern is 12px long, so this is orders of
// magnitude finer than anything the result is used for.
const ATTACK_LINK_LENGTH_SAMPLES = 32

/**
 * The drawn path's length, integrated from the cubic rather than read back out of the rendered `<path>`: the
 * component must not measure its own output (the whole point of deriving the head from the same control points),
 * and the dash phase below needs the length in the same render pass that produces the path data.
 */
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

/**
 * The dash phase that keeps the dashed tail clear of the arrowhead.
 *
 * The stroke paints its pattern from the path's *start*, so whether a dash happens to land in the head's last
 * few pixels is luck - and there it pokes out on both sides of the head, because the head tapers to a point and
 * the 4.5px stroke is wider than the head's silhouette over its front half. Anchoring the pattern so it *ends*
 * in a gap one gap length before the path's end pins the tail's last dash to the head's base instead. The path
 * itself still ends on the head's tip, so every measured point of the geometry is untouched.
 */
function resolveAttackLinkDashOffset(cubic: IAttackLinkCubic): number {
  const period = ATTACK_LINK_DASH_LENGTH_PX + ATTACK_LINK_DASH_GAP_PX
  const dashEndsAt = resolveAttackLinkPathLength(cubic) - ATTACK_LINK_DASH_GAP_PX
  const offset = (ATTACK_LINK_DASH_LENGTH_PX - dashEndsAt) % period

  return offset < 0 ? offset + period : offset
}

/**
 * The arrowhead, derived from the tail's own control points rather than measured off the drawn path: its tip is
 * the tail's end (so it sits on the anchor the geometry picked) and its rotation is the curve's end tangent - the
 * chord direction for the sweep, the arc's own tangent for the flat case - so the head always continues the tail
 * exactly.
 */
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