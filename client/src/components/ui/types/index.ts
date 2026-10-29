import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ImgHTMLAttributes,
  PropsWithChildren,
  RefCallback,
  ReactNode,
} from 'react'
import type { ICardStatusEffect, IGameActionOptionResponse } from '@/services/api/types/game'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { IDerivedGameViewState } from '@/views/game/types'

export type CardOverlayPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type ICardOverlayBadgeProps = {
  value?: number | string
  position?: CardOverlayPosition
  className?: string
  children?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  testId?: string
}

/**
 * Card art sizing rules live here rather than at each call site:
 *
 * - `card` is the only way to get a responsive image. With it, the component emits the whole width ladder as
 *   `srcset` and the browser downloads the step that covers the rendered box at this pixel ratio. A bare `src`
 *   (a bundled asset, a staged admin upload) stays a single file.
 * - `sizes` declares how wide the surface draws the card; `CARD_SIZES` holds one token per surface. Omitting it
 *   falls back to the board variant's width.
 * - `imageRendering` is deliberately absent. `pixelated` / `crisp-edges` were what made upscaled card art look
 *   blocky; art is now served at a size that does not need nearest-neighbour help.
 */
export type ICardImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt' | 'loading' | 'decoding' | 'width' | 'height' | 'fetchPriority'
> & {
  src?: string | null
  alt: string
  card?: Pick<ICardCatalogItemResponse, 'id' | 'image' | 'imageVersion'> | null
  variant?: 'board' | 'preview'
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'sync' | 'auto'
  fetchPriority?: 'high' | 'low' | 'auto'
  className?: string
  width?: number
  height?: number
  fallbackLabel?: string
}

export type ICardBackTone = 'blue' | 'orange'

export type ICardBackProps = {
  tone?: ICardBackTone
  className?: string
}

export type ISupportCardZoneProps = {
  className?: string
  slotClassName?: string
}

export type IPlayRowProps = {
  className?: string
  children?: ReactNode
}

export type IPlayResourceTrackerProps = {
  cardClassName: string
  className?: string
  reverse?: boolean
  isSummonCardReady?: boolean
}

export type IResourceTrackerShellProps = {
  reverse?: boolean
  className?: string
  chakraContent: ReactNode
  summonContent: ReactNode
}

export type IResourceChakraGridProps = {
  currentChakra?: number
  cardClassName: string
  className?: string
  slotClassName?: string
  slotCount?: number
  topRowCount?: number
}

export type IResourceSummonCardProps = {
  isSummonCardReady?: boolean
  className?: string
}

export type IPlayResourceZoneProps = {
  className?: string
  currentChakra?: number
  isSummonCardReady?: boolean
  chakraCardClassName?: string
}

export type IPlayPileZoneProps = {
  labels: string[]
  side: 'top' | 'bottom'
  className?: string
  cardBackTone?: ICardBackTone
  gameState?: IDerivedGameViewState | null
  deckCardRef?: RefCallback<HTMLDivElement>
  trashCardRef?: RefCallback<HTMLDivElement>
  onOpenTrashPile?: () => void
}

export type IPlayCardProps = {
  className?: string
  children?: ReactNode
} & React.HTMLAttributes<HTMLDivElement>

export type IFlippableCardProps = {
  isFlipped: boolean
  front: ReactNode
  back: ReactNode
  className?: string
  innerClassName?: string
  frontClassName?: string
  backClassName?: string
  durationMs?: number
}

export type ILeaderCardProps = {
  className?: string
  surfaceProps?: React.HTMLAttributes<HTMLDivElement> & {
    [key: `data-${string}`]: string | undefined
  }
  imageClassName: string
  hidePreviewButton?: boolean
  disableInteractions?: boolean
  placeholderLabel?: string
  showBadgeWhenLifeMissing?: boolean
  previewCard?: ICardCatalogItemResponse | null
  actionOptions?: IGameActionOptionResponse[]
  isConnected?: boolean
  isActionPending?: boolean
  isTargetCandidate?: boolean
  onChooseTarget?: () => void
  isEffectTargetCandidate?: boolean
  onToggleEffectTarget?: () => void
  onSelectActionOption?: (actionId: string) => void
  leaderCard: {
    id: string
    cardDefinitionId: string
    displayName: string
    image: string
    /** Art width ladder for `srcset`; the leader is the largest card on the board. */
    imageSrcSet?: string
    currentLife: number | null
    currentPower: number
    currentDamage: number
    statusEffects?: ICardStatusEffect[]
  } | null
}

export type IPanelProps = PropsWithChildren<{
  className?: string
}> &
  HTMLAttributes<HTMLElement>

export type ICardPreviewCardProps = {
  card: ICardCatalogItemResponse
  isOpen: boolean
  onClose: () => void
}

export type ICardListOverlayEntry = {
  instanceId: string
  displayName: string
  card: ICardCatalogItemResponse | null
}

export type ICardListOverlayProps = {
  isOpen: boolean
  title: string
  subtitle?: string
  entries: ICardListOverlayEntry[]
  emptyMessage?: string
  onClose: () => void
  testId?: string
}

export type IAppButtonProps = PropsWithChildren<{
  variant?: 'primary' | 'ghost'
}> &
  ButtonHTMLAttributes<HTMLButtonElement>
