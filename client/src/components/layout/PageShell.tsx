import { useEffect } from 'react'
import type { PropsWithChildren } from 'react'
import { useThemeStore } from '../../state/themeStore'

type IPageShellProps = PropsWithChildren<{
  compact?: boolean
  className?: string
  overlayClassName?: string
  backgroundClassName?: string
}>

export function PageShell({
  children,
  compact = false,
  className = '',
  overlayClassName = '',
  backgroundClassName,
}: IPageShellProps) {
  const initializeTheme = useThemeStore((state) => state.initializeTheme)
  const backgroundClasses =
    backgroundClassName ??
    'bg-[radial-gradient(circle_at_20%_20%,var(--app-bg-start)_0%,var(--app-bg-mid)_35%,var(--app-bg-deep)_65%,var(--app-bg-end)_100%)]'

  useEffect(() => {
    initializeTheme()
  }, [initializeTheme])

  return (
    <div
      className={`relative h-dvh overflow-hidden ${backgroundClasses} transition-colors duration-300 ${compact ? 'px-2 py-2 sm:px-3 sm:py-3 lg:px-4 lg:py-4' : 'px-4 py-8 sm:px-6 lg:px-10'} ${className}`}
    >
      <div className={`pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,var(--app-overlay-a)_0%,var(--app-overlay-b)_35%,var(--app-overlay-c)_75%,var(--app-overlay-b)_100%)] ${overlayClassName}`} />
      <div className={`relative mx-auto w-full max-w-7xl ${compact ? 'h-full overflow-hidden' : ''}`}>
        {children}
      </div>
    </div>
  )
}
