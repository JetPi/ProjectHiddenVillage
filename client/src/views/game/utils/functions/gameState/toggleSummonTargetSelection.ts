import type { Dispatch, SetStateAction } from 'react'
import type { ISummonTargetingState } from '@/views/game/types'

interface IToggleSummonTargetSelectionProps {
  targetCardInstanceId: string
  setPendingSummonTargeting: Dispatch<SetStateAction<ISummonTargetingState | null>>
}

function toggleSummonTargetSelection({
  targetCardInstanceId,
  setPendingSummonTargeting,
}: IToggleSummonTargetSelectionProps): void {
  setPendingSummonTargeting((previous) => {
    if (!previous) {
      return previous
    }

    const target = previous.validTargets.find((entry) =>
      entry.cardInstanceId.trim().toLowerCase() === targetCardInstanceId.trim().toLowerCase())

    if (!target) {
      return previous
    }

    const existingIndex = previous.selectedTargets.findIndex((entry) =>
      entry.cardInstanceId.trim().toLowerCase() === targetCardInstanceId.trim().toLowerCase())

    if (existingIndex >= 0) {
      return {
        ...previous,
        selectedTargets: previous.selectedTargets.filter((_, index) => index !== existingIndex),
      }
    }

    const nextSelectedTargets = [
      ...previous.selectedTargets,
      {
        playerId: target.playerId,
        zone: target.zone,
        cardInstanceId: target.cardInstanceId,
        isEffectResolutionStackTarget: target.isEffectResolutionStackTarget,
        effectResolutionEntryId: target.effectResolutionEntryId,
      },
    ]

    const maximumTargetCount = previous.exactTargetCount ?? previous.maximumTargetCount
    if (typeof maximumTargetCount === 'number' && nextSelectedTargets.length > maximumTargetCount) {
      return {
        ...previous,
        selectedTargets: nextSelectedTargets.slice(nextSelectedTargets.length - maximumTargetCount),
      }
    }

    return {
      ...previous,
      selectedTargets: nextSelectedTargets,
    }
  })
}

export { toggleSummonTargetSelection }