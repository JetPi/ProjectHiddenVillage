import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

type PlayRowProps = {
  className?: string
  children?: ReactNode
}

export function PlayRow({ className, children }: PlayRowProps) {
  return <div className={twMerge('min-h-0', className)}>{children}</div>
}
