import type { PropsWithChildren } from 'react'

export type IPageShellProps = PropsWithChildren<{
  compact?: boolean
  className?: string
  overlayClassName?: string
  backgroundClassName?: string
}>
