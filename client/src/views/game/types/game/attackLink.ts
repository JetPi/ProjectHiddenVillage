
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

export type IAttackLinkGeometryOptions = {
  sourceGapPx: number
  targetGapPx: number
  sweepSourceGapPx: number
  sweepTargetGapPx: number
  sideBendPx: number
}

export type IAttackLinkGeometry = {
  startAnchor: IAttackAnchorConfig
  endAnchor: IAttackAnchorConfig
  /**
   * Set for a sweep (both anchors on the same visual edge): the requested lateral bulge. The curve caps it by the
   * link's own span so a short, same-column pair cannot turn the arc into a hook.
   */
  sweepBendPx?: number
}

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

export type IAttackLinkHeadConfig = {
  x: number
  y: number
  rotationDeg: number
  sizePx: number
}
