import type { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

type PlayCardProps = {
  className?: string
  children?: ReactNode
}

export function PlayCard({ className, children }: PlayCardProps) {
  return (
    <div className={twMerge('w-auto max-w-full aspect-[200/277] object-cover', className)}>
      {children}
    </div>
  )
}
