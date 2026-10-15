// Rendering geometry for the attack link (the dashed tail + arrowhead the board draws itself). It lives
// here rather than in the hub view-models because it is pure presentation: the board re-derives it from
// the live DOM on every layout sample (see `resolveAttackLinkGeometry` in
// `utils/functions/gameState/gameZoneFunctions.ts`).

export type IBoardPoint = {
  x: number
  y: number
}

export type IAttackAnchorPosition = 'top' | 'bottom' | 'left' | 'right'

export type IAttackAnchorConfig = IAttackAnchorPosition | {
  position: IAttackAnchorPosition
  offset: {
    x: number
    y: number
  }
}

// Attack-link geometry *inputs*: the board's tuning constants. The geometry itself (anchor sides, gaps,
// the rotated-edge offsets and the curve parameters) is re-derived from the live elements by
// `resolveAttackLinkGeometry` on every layout sample, because a rested card's tilt animates and keeps
// moving its bounding box after the click.
export type IAttackLinkGeometryOptions = {
  sourceGapPx: number
  targetGapPx: number
  sweepSourceGapPx: number
  sweepTargetGapPx: number
  sideBendPx: number
}

// Resolved anchors plus the curve parameters. There is only one curve shape (the smooth cubic), so the
// old `path: 'smooth' | 'straight'` mode is gone - `resolveAttackLinkCubic` always bends the chord. Carrying
// `controlPointOffsets` selects the sweep's pixel-bent hook (it has to clear a whole card); without them the tail
// is the flat case's arc, whose depth and side the cubic derives from the chord itself (`ATTACK_LINK_ARC_*`, and
// the sign of both chord components, so the arc lobs towards the card it is aimed at).
export type IAttackLinkGeometry = {
  startAnchor: IAttackAnchorConfig
  endAnchor: IAttackAnchorConfig
  // Only the sweep reads this (its second handle sits on the chord, so `curveness` is what pulls the tail in).
  curveness: number
  controlPointOffsets?: {
    cpx1: number
    cpx2: number
  }
}

/**
 * The dashed tail as a cubic Bézier in board-local coordinates. The board owns this curve, so the arrowhead
 * is derived from the same control points instead of being measured back off rendered output
 * (see `AttackLinkArrow`).
 */
export type IAttackLinkCubic = {
  start: IBoardPoint
  control1: IBoardPoint
  control2: IBoardPoint
  end: IBoardPoint
}

export type IAttackLinkRenderConfig = {
  startId: string
  endId: string
  options: IAttackLinkGeometryOptions
}

// Custom arrowhead placement, derived from the tail's cubic rather than predicted from the anchors
// (see AttackLinkArrow), so the head can never drift off the line or off the cards. Coordinates are
// board-local: relative to the game board box, which is the offset parent of the overlay.
export type IAttackLinkHeadConfig = {
  // Base of the head (one head length behind the tail's end point along the tail's end direction) so the
  // head's tip lands exactly on the end of the dashed tail, covering the dash pattern's final gap.
  x: number
  y: number
  // Degrees, 0 = pointing right (+x), growing clockwise (SVG rotation convention).
  rotationDeg: number
  // Head length in px; the head shape is a unit shape scaled by this.
  sizePx: number
}
