import { twMerge } from 'tailwind-merge'
import type { IPlayRowProps } from '@/components/ui/types'

export function PlayRow({ className, children }: IPlayRowProps) {
  return <div className={twMerge('min-h-0', className)}>{children}</div>
}
