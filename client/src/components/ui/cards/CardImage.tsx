import { useEffect, useMemo, useState } from 'react'
import type { ImgHTMLAttributes } from 'react'
import { useTranslation } from 'react-i18next'
import { twMerge } from 'tailwind-merge'
import { CARD_SIZES } from '@/components/ui/cards/constants'
import type { ICardImageProps } from '@/components/ui/types'
import { preloadImageSource } from '@/services/imagePreloadCache'
import {
  CARD_ART_ASPECT,
  CARD_ART_WIDTHS,
  buildCardArtSrcSet,
  cardArtUrl,
} from '@/services/api/cardArt'

function buildFallbackImageSrc(title: string, unavailableLabel: string): string {
  const fallbackSvg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_ART_ASPECT.width}" height="${CARD_ART_ASPECT.height}" viewBox="0 0 ${CARD_ART_ASPECT.width} ${CARD_ART_ASPECT.height}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1f2937" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${CARD_ART_ASPECT.width}" height="${CARD_ART_ASPECT.height}" fill="url(#g)" rx="22" ry="22" />
    <text x="50%" y="48%" font-family="Segoe UI, sans-serif" text-anchor="middle" fill="#e5e7eb" font-size="20">${title}</text>
    <text x="50%" y="54%" font-family="Segoe UI, sans-serif" text-anchor="middle" fill="#9ca3af" font-size="15">${unavailableLabel}</text>
  </svg>`,
  )

  return `data:image/svg+xml;charset=UTF-8,${fallbackSvg}`
}

export function CardImage({
  src,
  alt,
  card,
  variant = 'board',
  sizes,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority = 'auto',
  className,
  width,
  height,
  fallbackLabel,
  onError,
  srcSet,
  ...imageProps
}: ICardImageProps) {
  const { t } = useTranslation()
  const resolvedSource = card?.id
    ? cardArtUrl(card.id, CARD_ART_WIDTHS[variant], card.imageVersion)
    : (src?.trim() ?? '')
  const normalizedSrc = resolvedSource.trim()
  const hasSource = normalizedSrc.length > 0
  // A card that knows its catalogue id gets the whole ladder, so the browser can pick the step that matches the
  // box it is actually drawn in at this device pixel ratio. Callers that hand over a ready-made srcSet (a staged
  // admin upload, for instance) keep theirs.
  const resolvedSrcSet = srcSet ?? (card?.id ? buildCardArtSrcSet(card) : undefined)
  const resolvedSizes = resolvedSrcSet
    ? (sizes ?? (variant === 'preview' ? CARD_SIZES.previewPanel : CARD_SIZES.boardFallback))
    : undefined
  // Reserving the art's own ratio up front stops a card from reflowing (and looking squashed for a frame) when
  // the image finally decodes. Explicit dimensions from the caller still win.
  const intrinsicWidth = width ?? (card?.id ? CARD_ART_ASPECT.width : undefined)
  const intrinsicHeight = height ?? (card?.id ? CARD_ART_ASPECT.height : undefined)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const hasLoadError = !hasSource || failedSource === normalizedSrc

  useEffect(() => {
    if (hasSource) {
      void preloadImageSource(normalizedSrc).catch(() => {
      })
    }
  }, [hasSource, normalizedSrc])

  useEffect(() => {
    if (!hasSource || failedSource !== normalizedSrc) {
      return
    }

    function handleReconnect() {
      setFailedSource((current) => (current === normalizedSrc ? null : current))
      void preloadImageSource(normalizedSrc).catch(() => {
      })
    }

    window.addEventListener('online', handleReconnect)
    return () => window.removeEventListener('online', handleReconnect)
  }, [failedSource, hasSource, normalizedSrc])

  const resolvedFallbackLabel = useMemo(() => {
    if (fallbackLabel?.trim()) {
      return fallbackLabel
    }

    return t('components.ui.cardImage.fallbackLabel')
  }, [fallbackLabel, t])

  const fallbackImageSrc = useMemo(
    () =>
      buildFallbackImageSrc(
        t('components.ui.cardImage.placeholderTitle'),
        t('components.ui.cardImage.placeholderUnavailable'),
      ),
    [t],
  )

  const handleError: ImgHTMLAttributes<HTMLImageElement>['onError'] = (event) => {
    setFailedSource(normalizedSrc)
    onError?.(event)
  }

  if (!hasSource || hasLoadError) {
    return (
      <div
        aria-label={resolvedFallbackLabel}
        data-testid="card-image-fallback"
        className={twMerge(
          'relative grid min-h-0 min-w-0 place-items-center overflow-hidden rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)] text-center text-xs tracking-[0.08em] text-[var(--text-muted)]',
          className,
        )}
        style={{ width, height }}
      >
        <img
          src={fallbackImageSrc}
          alt={resolvedFallbackLabel}
          draggable={false}
          onDragStart={(event) => {
            event.preventDefault()
          }}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 block h-full w-full rounded-xl object-cover"
        />
      </div>
    )
  }

  return (
    <img
      {...imageProps}
      src={normalizedSrc}
      srcSet={resolvedSrcSet}
      sizes={resolvedSizes}
      alt={alt}
      draggable={false}
      onDragStart={(event) => {
        event.preventDefault()
      }}
      width={intrinsicWidth}
      height={intrinsicHeight}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      onError={handleError}
      className={twMerge('rounded-xl object-cover', className)}
    />
  )
}
