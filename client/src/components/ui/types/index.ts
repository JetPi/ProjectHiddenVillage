import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ImgHTMLAttributes,
  PropsWithChildren,
  RefObject,
  ReactNode,
} from 'react'
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
  leaderCard: {
    id: string
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
  className?: string
  imageLoading?: 'lazy' | 'eager'
}

export type IAppButtonProps = PropsWithChildren<{
  variant?: 'primary' | 'ghost'
}> &
  ButtonHTMLAttributes<HTMLButtonElement>
