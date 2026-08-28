import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ImgHTMLAttributes,
  PropsWithChildren,
  RefObject,
  ReactNode,
} from 'react'
import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { IDerivedGameViewState } from '@/views/game/types/viewModels'

export type ICardOverlayBadgeProps = {
  value: number
  className?: string
}

export type ICardImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'alt' | 'loading' | 'decoding' | 'width' | 'height' | 'fetchPriority'
> & {
  src?: string | null
  alt: string
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
  isSummonCardReady?: boolean
  chakraCardClassName?: string
}

export type IPlayPileZoneProps = {
  labels: string[]
  side: 'top' | 'bottom'
  className?: string
  cardBackTone?: ICardBackTone
  gameState?: IDerivedGameViewState | null
  deckCardRef?: RefObject<HTMLDivElement | null>
  trashCardRef?: RefObject<HTMLDivElement | null>
}

export type IPlayCardProps = {
  className?: string
  children?: ReactNode
}

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
  imageClassName: string
  placeholderLabel?: string
  showBadgeWhenLifeMissing?: boolean
  previewCard?: ICardCatalogItemResponse | null
  actionOptions?: IGameActionOptionResponse[]
  isConnected?: boolean
  isActionPending?: boolean
  onSelectActionOption?: (actionId: string) => void
  leaderCard: {
    id: string
    cardDefinitionId: string
    displayName: string
    image: string
    currentLife: number | null
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

export type IAppButtonProps = PropsWithChildren<{
  variant?: 'primary' | 'ghost'
}> &
  ButtonHTMLAttributes<HTMLButtonElement>
