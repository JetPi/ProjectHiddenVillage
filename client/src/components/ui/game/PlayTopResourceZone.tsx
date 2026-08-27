import { ResourceTrackerShell } from '@/components/ui/game/ResourceTrackerShell'
import { ResourceChakraGrid } from '@/components/ui/game/ResourceChakraGrid'
import { ResourceSummonCard } from '@/components/ui/game/ResourceSummonCard'
import type { IPlayResourceZoneProps } from '@/components/ui/types'

export function PlayTopResourceZone({ className, isSummonCardReady = true, chakraCardClassName = 'turn-band-blue' }: IPlayResourceZoneProps) {
  return (
    <ResourceTrackerShell
      reverse
      className={className}
      chakraContent={<ResourceChakraGrid cardClassName={chakraCardClassName} slotClassName="h-[2.85rem]" />}
      summonContent={<ResourceSummonCard isSummonCardReady={isSummonCardReady} />}
    />
  )
}
