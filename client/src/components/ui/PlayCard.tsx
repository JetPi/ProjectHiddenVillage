import { twMerge } from 'tailwind-merge'
import type { IPlayCardProps } from './types'

export function PlayCard({ className, children }: IPlayCardProps) {
  return (
    <div className={twMerge('w-auto max-w-full aspect-[200/277] object-cover', className)}>
      {children}
    </div>
  )
}
