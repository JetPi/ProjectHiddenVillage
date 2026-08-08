import { useEffect, useMemo, useState } from 'react'
import type { ImgHTMLAttributes } from 'react'
import { twMerge } from 'tailwind-merge'
import { preloadImageSource } from '../../services/imagePreloadCache'

const fallbackSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="500" viewBox="0 0 360 500">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1f2937" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="360" height="500" fill="url(#g)" rx="22" ry="22" />
    <text x="50%" y="48%" font-family="Segoe UI, sans-serif" text-anchor="middle" fill="#e5e7eb" font-size="20">Card Image</text>
    <text x="50%" y="54%" font-family="Segoe UI, sans-serif" text-anchor="middle" fill="#9ca3af" font-size="15">Unavailable</text>
  </svg>`,
)

const FALLBACK_IMAGE_SRC = `data:image/svg+xml;charset=UTF-8,${fallbackSvg}`

type ICardImageProps = Omit<
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

export function CardImage({
  src,
  alt,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority = 'auto',
  className,
  width,
  height,
  fallbackLabel,
  onError,
  ...imageProps
}: ICardImageProps) {
  const normalizedSrc = src?.trim() ?? ''
  const hasSource = normalizedSrc.length > 0
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const hasLoadError = !hasSource || failedSource === normalizedSrc

  useEffect(() => {
    if (hasSource) {
      void preloadImageSource(normalizedSrc).catch(() => {
        // CardImage should fall back visually when image loading fails.
      })
    }
  }, [hasSource, normalizedSrc])

  const resolvedFallbackLabel = useMemo(() => {
    if (fallbackLabel?.trim()) {
      return fallbackLabel
    }

    return 'Card image unavailable'
  }, [fallbackLabel])

  const handleError: ImgHTMLAttributes<HTMLImageElement>['onError'] = (event) => {
    setFailedSource(normalizedSrc)
    onError?.(event)
  }

  if (!hasSource || hasLoadError) {
    return (
      <div
        aria-label={resolvedFallbackLabel}
        className={twMerge(
          'grid place-items-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)] text-center text-xs tracking-[0.08em] text-[var(--text-muted)]',
          className,
        )}
        style={{ width, height }}
      >
        <img
          src={FALLBACK_IMAGE_SRC}
          alt={resolvedFallbackLabel}
          loading="lazy"
          decoding="async"
          className="h-full w-full rounded-xl object-cover"
        />
      </div>
    )
  }

  return (
    <img
      {...imageProps}
      src={normalizedSrc}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      onError={handleError}
      className={twMerge('rounded-xl object-cover', className)}
    />
  )
}
