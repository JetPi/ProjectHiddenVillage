
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
  curveness: number
  controlPointOffsets?: {
    cpx1: number
    cpx2: number
  }
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
