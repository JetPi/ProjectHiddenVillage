import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

type IPlayRowProps = {
  className?: string
  children?: ReactNode
}

export function PlayRow({ className, children }: IPlayRowProps) {
  return <div className={twMerge('min-h-0', className)}>{children}</div>
}
