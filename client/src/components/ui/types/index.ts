import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ImgHTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from 'react'
import type { ICardCatalogItemResponse } from '../../../types/cardCatalog'

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
  className?: string
  cardBackTone?: ICardBackTone
}

export type IPlayCardProps = {
  className?: string
  children?: ReactNode
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
