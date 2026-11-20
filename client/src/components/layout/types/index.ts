import type { PropsWithChildren } from 'react'

export type IPageShellProps = PropsWithChildren<{
  compact?: boolean
  fullBleed?: boolean
  edgeToEdge?: boolean
  scrollable?: boolean
  /**
   * Opt in to the app-wide large-screen scale: while mounted, the root font size grows with the viewport width, so
   * every rem-based size on the page (type, padding, panel widths) grows with it. Used by the auth views, which are
   * entirely rem-based; the game view has its own unit-based ladder and does not opt in.
   */
  scaleToViewport?: boolean
  className?: string
  overlayClassName?: string
  backgroundClassName?: string
}>
