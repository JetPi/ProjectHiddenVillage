import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { IGamePlayerStateResponse } from '@/services/api/gameApi'
import type { IGameActionOptionResponse } from '@/services/api/types/game'

export type IGameCard = ICardCatalogItemResponse

export type ILeaderCardViewModel = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  isRested: boolean
  isExhausted: boolean
  id: string
  image: string
  attribute: string | null
  name: string[]
  displayName: string
  type: string
  traits: string[]
  color: string
  description: string
  damage: number
  power: number
  life: number | null
  currentLife: number | null
  currentPower: number
  currentDamage: number
  recoveryEffect: string
  availableActions?: IGameActionOptionResponse[]
}

export type INonLeaderCardViewModel = {
  instanceId: string
  cardDefinitionId: string
  ownerPlayerId: string
  controllerPlayerId: string
  id: string
  image: string
  displayName: string
  type: string
  isFaceUp: boolean
  isConcealedFromOpponent?: boolean
  // True while a reveal shows this card's face to both players (a "Reveal First" effect can turn an opponent's
  // face-down support card over, or show one of their hand cards).
  isRevealed: boolean
  isExhausted: boolean
  availableActions?: IGameActionOptionResponse[]
  isRested: boolean
  supportSlotIndex?: number | null
  currentPower: number
  currentHealth: number
  currentDamage: number
}

export type IDerivedGameViewState = {
  cardById: Map<string, IGameCard>
  cardTypeById: Map<string, string>
  currentPlayer: IGamePlayerStateResponse | null
  opponentPlayer: IGamePlayerStateResponse | null
  topLeaderCard: ILeaderCardViewModel | null
  bottomLeaderCard: ILeaderCardViewModel | null
}

export type ICardPreloadPayload = {
  cardIds: string[]
  signature: string
}

export type IBoardPoint = {
  x: number
  y: number
}

export type IAttackLinkPathMode = 'smooth' | 'straight'

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
// `resolveAttackLinkGeometry` on every layout sample, because a rested card is tilted by a CSS
// transition - its bounding box, which is what react-xarrows anchors on, keeps moving after the click.
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
  path: IAttackLinkPathMode
  curveness: number
  controlPointOffsets?: {
    cpx1: number
    cpx2: number
  }
}

export type IAttackLinkRenderConfig = {
  startId: string
  endId: string
  headOffsetForward: number
  options: IAttackLinkGeometryOptions
}

// Custom arrowhead placement. It is measured from the dashed tail react-xarrows actually drew (see
// AttackLinkArrow) rather than predicted from the anchors, so the head can never drift off the line or
// off the cards. Coordinates are board-local: relative to the game board box, which is the offset
// parent of the overlay.
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
