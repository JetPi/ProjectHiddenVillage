import type { Dispatch, SetStateAction } from 'react'
import type { IEffectTargetingState } from '@/views/game/types'

interface IToggleEffectTargetSelectionProps {
  targetCardInstanceId: string
  setPendingEffectTargeting: Dispatch<SetStateAction<IEffectTargetingState | null>>
}

/**
 * Multi-pick counterpart of `toggleSummonTargetSelection`: a candidate is added on first toggle and
 * removed on the second, and selecting past the declared maximum drops the oldest pick so the
 * selection can never exceed what the server accepts (range supports are "up to N").
 */
function toggleEffectTargetSelection({
  targetCardInstanceId,
  setPendingEffectTargeting,
}: IToggleEffectTargetSelectionProps): void {
  setPendingEffectTargeting((previous) => {
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

export { toggleEffectTargetSelection }
