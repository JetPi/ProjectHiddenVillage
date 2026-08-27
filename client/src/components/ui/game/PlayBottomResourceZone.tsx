import { ResourceTrackerShell } from '@/components/ui/game/ResourceTrackerShell'
import { ResourceChakraGrid } from '@/components/ui/game/ResourceChakraGrid'
import { ResourceSummonCard } from '@/components/ui/game/ResourceSummonCard'
import type { IPlayResourceZoneProps } from '@/components/ui/types'

export function PlayBottomResourceZone({ className, isSummonCardReady = true, chakraCardClassName = 'turn-band-orange-button' }: IPlayResourceZoneProps) {
  return (
    <ResourceTrackerShell
      className={className}
      chakraContent={<ResourceChakraGrid cardClassName={chakraCardClassName} slotClassName="w-[2.22rem]" />}
      summonContent={<ResourceSummonCard isSummonCardReady={isSummonCardReady} />}
    />
  )
}
