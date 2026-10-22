import type {
  IAttackAnchorConfig,
  IAttackLinkCubic,
  IAttackLinkGeometry,
  IBoardPoint,
} from '@/views/game/types/game/attackLink'

export type IAttackLinkRect = {
  left: number
  top: number
  width: number
  height: number
}

/** How deep a diagonal link bows relative to its own chord, plus the absolute bounds that keep it readable. */
export const ATTACK_LINK_ARC_DEPTH_FACTOR = 0.25
export const ATTACK_LINK_ARC_MIN_DEPTH_PX = 40
export const ATTACK_LINK_ARC_MAX_DEPTH_PX = 120

/**
 * A "sweep" link runs between two cards that sit on the same side of the board: both anchors are placed on the
 * same visual edge and the arc bulges away from it. The requested bend is a fixed px offset, so on a short,
 * same-column pair it used to dominate the chord: the curve left sideways, doubled back to reach the target's
 * edge and slid along it, which rendered as a V with the arrowhead pointing up the card. The bulge is therefore
 * capped by the link's own span, which keeps the two tangents symmetric around the chord at every length.
 */
export const ATTACK_LINK_SWEEP_BEND_RATIO = 0.32

/**
 * How far along the chord each control point sits. Pushing both controls towards the middle is what distributes
 * the turn across the whole arc; a pure sideways offset (no chord term) makes the curve leave and re-enter the
 * shared edge almost perpendicularly and concentrates the turn at the two ends again.
 */
export const ATTACK_LINK_SWEEP_CONTROL_PULL = 0.43

function resolveAttackAnchorPoint(anchor: IAttackAnchorConfig, rect: IAttackLinkRect): IBoardPoint {
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

  if (geometry.sweepBendPx !== undefined) {
    // One symmetric bulge: both control points carry the same lateral offset, so the start and end tangents
    // mirror each other around the chord and the arc turns gradually instead of hooking at the target edge.
    const requestedBend = geometry.sweepBendPx
    const bendMagnitude = Math.min(Math.abs(requestedBend), chordLength * ATTACK_LINK_SWEEP_BEND_RATIO)
    const bend = (requestedBend < 0 ? -1 : 1) * bendMagnitude
    const alongX = deltaX * ATTACK_LINK_SWEEP_CONTROL_PULL
    const alongY = deltaY * ATTACK_LINK_SWEEP_CONTROL_PULL

    return {
      start,
      control1: { x: start.x + alongX + normalX * bend, y: start.y + alongY + normalY * bend },
      control2: { x: end.x - alongX + normalX * bend, y: end.y - alongY + normalY * bend },
      end,
    }
  }

  const arcDepth = Math.min(
    Math.max(chordLength * ATTACK_LINK_ARC_DEPTH_FACTOR, ATTACK_LINK_ARC_MIN_DEPTH_PX),
    ATTACK_LINK_ARC_MAX_DEPTH_PX,
  )
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

export { resolveAttackAnchorPoint, resolveAttackLinkCubic }
