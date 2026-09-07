import type { ISummonTargetingState } from '@/views/game/types'

function canConfirmSummonTargetSelection(targeting: ISummonTargetingState): boolean {
  const selectedCount = targeting.selectedTargets.length

  if (typeof targeting.exactTargetCount === 'number') {
    return selectedCount === targeting.exactTargetCount
  }

  if (typeof targeting.minimumTargetCount === 'number' && selectedCount < targeting.minimumTargetCount) {
    return false
  }

  if (typeof targeting.maximumTargetCount === 'number' && selectedCount > targeting.maximumTargetCount) {
    return false
  }

  return selectedCount > 0 || targeting.validTargets.length === 0
}

export { canConfirmSummonTargetSelection }
