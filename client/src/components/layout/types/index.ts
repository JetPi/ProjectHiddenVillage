import type { PropsWithChildren } from 'react'

export type IPageShellProps = PropsWithChildren<{
  compact?: boolean
  fullBleed?: boolean
  edgeToEdge?: boolean
  className?: string
  overlayClassName?: string
  backgroundClassName?: string
}>
