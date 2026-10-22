import { expect, test } from '@playwright/test'
import {
  resolveAttackLinkCubic,
} from '../client/src/views/game/utils/functions/gameState/attackLinkCurve'
import type {
  IAttackAnchorConfig,
  IAttackLinkCubic,
  IAttackLinkGeometry,
} from '../client/src/views/game/types/game/attackLink'

/**
 * The attack-link curve, measured rather than eyeballed.
 *
 * Two shapes exist:
 *  - a **diagonal** link (anchors on different edges: the source's top/bottom, the target's left/right), and
 *  - a **sweep** link: both cards sit on the same side of the board, so both anchors are on the same visual edge.
 *
 * The reported bug was a sweep: a same-column attacker/target pair with a short chord. The sweep used to apply a
 * fixed 110 px sideways bend on top of a 160 px chord, so the curve left sideways, doubled back and slid along the
 * target's edge - a V with the arrowhead pointing up the card. These tests pin the geometric properties that make
 * an arc an arc, for every span, so the diagonal shapes that already looked right keep their behaviour.
 *
 * Sampling: 100 cubic samples, tangent turn measured over a window covering a tenth of the curve. Measured on the
 * pre-fix sweep (chord 160, bend 110): 29.6 deg of turn inside one window, and an end tangent parallel to the
 * chord. The fixed sweep measures 12.7 deg and enters the card at 36 deg.
 */

const SAMPLES = 100
const WINDOW = 10
const RIGHT_EDGE: IAttackAnchorConfig = { position: 'right', offset: { x: 12, y: 0 } }

type IPoint = { x: number; y: number }
type IRect = { left: number; top: number; width: number; height: number }

const cardRect = (left: number, top: number): IRect => ({ left, top, width: 80, height: 110 })

function sampleCubic(cubic: IAttackLinkCubic, samples = SAMPLES): IPoint[] {
  const points: IPoint[] = []

  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples
    const u = 1 - t
    points.push({
      x: u * u * u * cubic.start.x
        + 3 * u * u * t * cubic.control1.x
        + 3 * u * t * t * cubic.control2.x
        + t * t * t * cubic.end.x,
      y: u * u * u * cubic.start.y
        + 3 * u * u * t * cubic.control1.y
        + 3 * u * t * t * cubic.control2.y
        + t * t * t * cubic.end.y,
    })
  }

  return points
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI
}

function tangentAnglesDeg(points: IPoint[]): number[] {
  return points.slice(1).map((point, index) => toDegrees(
    Math.atan2(point.y - points[index].y, point.x - points[index].x),
  ))
}

function turnDeg(from: number, to: number): number {
  return Math.abs(((to - from + 540) % 360) - 180)
}

function angularDistanceDeg(from: number, to: number): number {
  return turnDeg(from, to)
}

/** The largest direction change inside one window: a chevron concentrates its turn here, an arc does not. */
function maxWindowTurnDeg(angles: number[], window = WINDOW): number {
  let max = 0

  for (let index = 0; index + window < angles.length; index += 1) {
    max = Math.max(max, turnDeg(angles[index], angles[index + window]))
  }

  return max
}

function chordDeg(cubic: IAttackLinkCubic): number {
  return toDegrees(Math.atan2(cubic.end.y - cubic.start.y, cubic.end.x - cubic.start.x))
}

/** Direction of the sum of the two forward tangents: the chord's direction for a symmetric bulge. */
function tangentBisectorDeg(cubic: IAttackLinkCubic): number {
  const startX = cubic.control1.x - cubic.start.x
  const startY = cubic.control1.y - cubic.start.y
  const endX = cubic.end.x - cubic.control2.x
  const endY = cubic.end.y - cubic.control2.y
  const startLength = Math.hypot(startX, startY) || 1
  const endLength = Math.hypot(endX, endY) || 1

  return toDegrees(Math.atan2(
    startY / startLength + endY / endLength,
    startX / startLength + endX / endLength,
  ))
}

function endTangentDeg(cubic: IAttackLinkCubic): number {
  return toDegrees(Math.atan2(
    cubic.end.y - cubic.control2.y,
    cubic.end.x - cubic.control2.x,
  ))
}

function maxBulgePx(points: IPoint[], start: IPoint, end: IPoint): number {
  const chordX = end.x - start.x
  const chordY = end.y - start.y
  const chordLength = Math.hypot(chordX, chordY) || 1

  return Math.max(...points.map((point) => {
    return Math.abs((point.x - start.x) * chordY - (point.y - start.y) * chordX) / chordLength
  }))
}

const sweepGeometry = (bendPx: number): IAttackLinkGeometry => ({
  startAnchor: RIGHT_EDGE,
  endAnchor: RIGHT_EDGE,
  sweepBendPx: bendPx,
})

const diagonalGeometry = (
  startAnchor: IAttackAnchorConfig,
  endAnchor: IAttackAnchorConfig,
): IAttackLinkGeometry => ({ startAnchor, endAnchor })

test.describe('attack link curve', () => {
  test('a short same-column sweep is one smooth arc, not a V', () => {
    // The recorded case: both cards in the same column, one row apart, requested bend 110 px.
    const source = cardRect(280, 320)
    const target = cardRect(280, 160)
    const cubic = resolveAttackLinkCubic(sweepGeometry(110), source, target)
    const points = sampleCubic(cubic)
    const angles = tangentAnglesDeg(points)
    const chordLength = Math.hypot(cubic.end.x - cubic.start.x, cubic.end.y - cubic.start.y)

    expect(chordLength).toBeGreaterThan(150)
    expect(chordLength).toBeLessThan(170)

    // The V signature: a sixth of the curve carried ~30 deg of turn. A smooth arc stays under 20 deg here.
    expect(
      maxWindowTurnDeg(angles),
      'a short sweep must not concentrate its turn into a corner',
    ).toBeLessThan(20)

    // The two tangents mirror each other around the chord: one bulge, no hook back to the edge.
    expect(
      angularDistanceDeg(tangentBisectorDeg(cubic), chordDeg(cubic)),
      'a sweep must bulge symmetrically around its chord',
    ).toBeLessThan(8)

    // The arrowhead enters the card from the side instead of running along the card's edge.
    expect(
      angularDistanceDeg(endTangentDeg(cubic), chordDeg(cubic)),
      'the tail must not slide along the target edge',
    ).toBeGreaterThan(15)

    // Anchors unchanged: both on the same visual edge, one gap away from its card.
    expect(cubic.start).toEqual({ x: source.left + source.width + 12, y: source.top + source.height / 2 })
    expect(cubic.end).toEqual({ x: target.left + target.width + 12, y: target.top + target.height / 2 })

    // The bulge stays on the inward side and inside the span-scaled cap: the lateral offset of both controls is
    // 0.32 of the chord, and the curve peaks at 0.75 of that offset.
    const bulge = maxBulgePx(points, cubic.start, cubic.end)
    expect(bulge).toBeGreaterThan(0)
    expect(bulge, 'the bulge is capped by the chord, so a short pair cannot be over-bent').toBeLessThanOrEqual(
      chordLength * 0.24 + 1,
    )
    expect(Math.max(...points.map((point) => point.x)), 'the arc bows to the right edge').toBeGreaterThan(cubic.start.x)
  })

  test('a long same-column sweep keeps its arc and honours the requested bend', () => {
    const source = cardRect(280, 600)
    const target = cardRect(280, 120)
    const cubic = resolveAttackLinkCubic(sweepGeometry(110), source, target)
    const points = sampleCubic(cubic)
    const angles = tangentAnglesDeg(points)

    expect(maxWindowTurnDeg(angles)).toBeLessThan(20)
    expect(angularDistanceDeg(tangentBisectorDeg(cubic), chordDeg(cubic))).toBeLessThan(8)
    // 110 px requested, well under the chord cap: the arc keeps the bend the board asks for (bulge = 0.75 x bend).
    expect(maxBulgePx(points, cubic.start, cubic.end)).toBeGreaterThan(75)
    expect(maxBulgePx(points, cubic.start, cubic.end)).toBeLessThan(90)
  })

  test('the same sweep bulges to the same side from either half of the board', () => {
    // Each client draws the attacker at its own bottom, so one pending attack travels up the board on one page
    // and down on the other. The bend is signed in board space, so both copies must bow towards the right and
    // enter the card - before the fix the downward copy multiplied by the chord normal, which flips with the
    // travel direction, and mirrored the arc into the two cards.
    const upward = resolveAttackLinkCubic(sweepGeometry(110), cardRect(280, 320), cardRect(280, 160))
    const downward = resolveAttackLinkCubic(sweepGeometry(110), cardRect(280, 160), cardRect(280, 320))
    const upwardTarget = cardRect(280, 160)
    const downwardTarget = cardRect(280, 320)

    for (const [label, cubic, target] of [
      ['upward', upward, upwardTarget],
      ['downward', downward, downwardTarget],
    ] as const) {
      const angles = tangentAnglesDeg(sampleCubic(cubic))

      expect(maxWindowTurnDeg(angles), `${label} sweep turned into a corner`).toBeLessThan(20)
      expect(
        angularDistanceDeg(tangentBisectorDeg(cubic), chordDeg(cubic)),
        `${label} sweep is not symmetric around its chord`,
      ).toBeLessThan(8)

      // Positive bend == towards the right, whichever way the arrow travels.
      expect(cubic.control1.x, `${label} sweep bulged away from its positive bend`).toBeGreaterThan(cubic.start.x)
      expect(cubic.control2.x, `${label} sweep bulged away from its positive bend`).toBeGreaterThan(cubic.end.x)

      // The head is drawn along the end tangent: it must point into the target, not away from it.
      const targetCenterX = target.left + target.width / 2
      const targetCenterY = target.top + target.height / 2
      const tangentX = cubic.end.x - cubic.control2.x
      const tangentY = cubic.end.y - cubic.control2.y
      expect(
        tangentX * (targetCenterX - cubic.end.x) + tangentY * (targetCenterY - cubic.end.y),
        `${label} sweep entered the target backwards`,
      ).toBeGreaterThan(0)
    }

    // The other half of the board asks for the negative bend; both directions mirror to the left.
    const mirroredUpward = resolveAttackLinkCubic(sweepGeometry(-110), cardRect(280, 320), cardRect(280, 160))
    const mirroredDownward = resolveAttackLinkCubic(sweepGeometry(-110), cardRect(280, 160), cardRect(280, 320))

    for (const [label, cubic] of [
      ['upward', mirroredUpward],
      ['downward', mirroredDownward],
    ] as const) {
      expect(cubic.control1.x, `${label} mirrored sweep ignored its negative bend`).toBeLessThan(cubic.start.x)
      expect(cubic.control2.x, `${label} mirrored sweep ignored its negative bend`).toBeLessThan(cubic.end.x)
    }
  })

  test('a diagonal link keeps the arc it has today', () => {
    // Bottom-half attacker to a target up and to the right: top edge out, left edge in - the shape every
    // existing battle spec renders when the target is the opponent's leader.
    const source = cardRect(180, 420)
    const target = cardRect(760, 150)
    const cubic = resolveAttackLinkCubic(
      diagonalGeometry(
        { position: 'top', offset: { x: 0, y: -12 } },
        { position: 'left', offset: { x: -10, y: 0 } },
      ),
      source,
      target,
    )
    const points = sampleCubic(cubic)
    const angles = tangentAnglesDeg(points)

    expect(maxWindowTurnDeg(angles)).toBeLessThan(15)
    expect(maxBulgePx(points, cubic.start, cubic.end)).toBeGreaterThan(20)
    expect(cubic.start).toEqual({ x: source.left + source.width / 2, y: source.top - 12 })
    expect(cubic.end).toEqual({ x: target.left - 10, y: target.top + target.height / 2 })

    // The end tangent points into the target card.
    const tangentX = cubic.end.x - cubic.control2.x
    const tangentY = cubic.end.y - cubic.control2.y
    const intoTargetX = target.left + target.width / 2 - cubic.end.x
    const intoTargetY = target.top + target.height / 2 - cubic.end.y
    expect(tangentX * intoTargetX + tangentY * intoTargetY).toBeGreaterThan(0)
  })

  test('no link bends back on itself at any span', () => {
    const sourceX = 280
    const spans = [70, 100, 160, 240, 360, 520, 720]

    for (const span of spans) {
      const sweep = resolveAttackLinkCubic(
        sweepGeometry(110),
        cardRect(sourceX, 700),
        cardRect(sourceX, 700 - span),
      )
      const sweepAngles = tangentAnglesDeg(sampleCubic(sweep))
      expect(
        maxWindowTurnDeg(sweepAngles),
        `sweep at span ${span} turned into a corner`,
      ).toBeLessThan(20)
      expect(
        angularDistanceDeg(tangentBisectorDeg(sweep), chordDeg(sweep)),
        `sweep at span ${span} is not symmetric around its chord`,
      ).toBeLessThan(8)

      const diagonal = resolveAttackLinkCubic(
        diagonalGeometry(
          { position: 'top', offset: { x: 0, y: -12 } },
          { position: 'right', offset: { x: 10, y: 0 } },
        ),
        cardRect(sourceX, 700),
        cardRect(sourceX, 700 - span),
      )
      const diagonalAngles = tangentAnglesDeg(sampleCubic(diagonal))
      // The diagonal branch keeps its existing absolute minimum depth, which makes a very short link (70 px)
      // visibly curved by design. The bound exists to catch a corner (the pre-fix sweep measured 29.6 deg), not
      // to forbid curvature, so it sits above that short-link value and below the chevron.
      expect(
        maxWindowTurnDeg(diagonalAngles),
        `diagonal at span ${span} turned into a corner`,
      ).toBeLessThan(22)
    }
  })
})
