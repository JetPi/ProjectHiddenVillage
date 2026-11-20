import { useEffect } from 'react'
import { useThemeStore } from '@/state/themeStore'
import type { IPageShellProps } from '@/components/layout/types'

export function PageShell({
  children,
  compact = false,
  fullBleed = false,
  edgeToEdge = false,
  scrollable = false,
  scaleToViewport = false,
  className = '',
  overlayClassName = '',
  backgroundClassName,
}: IPageShellProps) {
  const initializeTheme = useThemeStore((state) => state.initializeTheme)
  const backgroundClasses =
    backgroundClassName ??
    'bg-[radial-gradient(circle_at_20%_20%,var(--app-bg-start)_0%,var(--app-bg-mid)_35%,var(--app-bg-deep)_65%,var(--app-bg-end)_100%)]'
  const viewportClasses = scrollable ? 'min-h-dvh overflow-y-auto' : 'h-dvh overflow-hidden'
  // A scrollable shell can be taller than the viewport, so its tint layer has to follow the viewport instead of the box.
  const overlayPositionClass = scrollable ? 'fixed' : 'absolute'

  useEffect(() => {
    initializeTheme()
  }, [initializeTheme])

  // The auth screens are rem-based end to end, so growing the root font size is the one lever that scales the whole
  // page - headings, labels, paddings and the `max-w-*` panel widths together. The attribute is scoped to this shell's
  // lifetime, so navigating to the game view removes it and its px-token ladder is unaffected.
  useEffect(() => {
    if (!scaleToViewport) {
      return
    }

    const root = document.documentElement
    root.dataset.surface = 'app'

    return () => {
      delete root.dataset.surface
    }
  }, [scaleToViewport])

  return (
    <div
      className={`relative ${viewportClasses} ${backgroundClasses} ${edgeToEdge ? 'p-0' : compact ? 'px-2 py-2 sm:px-3 sm:py-3 lg:px-4 lg:py-4' : 'px-4 py-8 sm:px-6 lg:px-10'} ${className}`}
    >
      <div className={`pointer-events-none ${overlayPositionClass} inset-0 bg-[linear-gradient(110deg,var(--app-overlay-a)_0%,var(--app-overlay-b)_35%,var(--app-overlay-c)_75%,var(--app-overlay-b)_100%)] ${overlayClassName}`} />
      <div
        className={`relative w-full ${fullBleed ? 'max-w-none' : 'mx-auto max-w-7xl'} ${compact ? 'h-full overflow-hidden' : ''}`}
      >
        {children}
      </div>
    </div>
  )
}
