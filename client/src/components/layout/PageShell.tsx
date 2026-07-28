import { useEffect } from 'react'
import type { PropsWithChildren } from 'react'
import { useThemeStore } from '../../state/themeStore'

export function PageShell({ children }: PropsWithChildren) {
  const initializeTheme = useThemeStore((state) => state.initializeTheme)

  useEffect(() => {
    initializeTheme()
  }, [initializeTheme])

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_20%_20%,var(--app-bg-start)_0%,var(--app-bg-mid)_35%,var(--app-bg-deep)_65%,var(--app-bg-end)_100%)] px-4 py-8 transition-colors duration-300 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,var(--app-overlay-a)_0%,var(--app-overlay-b)_35%,var(--app-overlay-c)_75%,var(--app-overlay-b)_100%)]" />
      <div className="relative mx-auto w-full max-w-7xl">
        {children}
      </div>
    </div>
  )
}
