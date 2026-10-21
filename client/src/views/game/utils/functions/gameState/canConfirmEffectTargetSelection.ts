import type { IEffectTargetingState } from '@/views/game/types'

function resolveEffectTargetRequiredCount(targeting: IEffectTargetingState): number {
  if (typeof targeting.exactTargetCount === 'number') {
    return targeting.exactTargetCount
  }

  return targeting.minimumTargetCount ?? 1
}

function canConfirmEffectTargetSelection(targeting: IEffectTargetingState): boolean {
  const selectedCount = targeting.selectedTargets.length

  if (targeting.validTargets.length === 0) {
    return false
  }

  if (typeof targeting.exactTargetCount === 'number') {
    return selectedCount === targeting.exactTargetCount
  }

  if (selectedCount < (targeting.minimumTargetCount ?? 1)) {
    return false
  }

  if (typeof targeting.maximumTargetCount === 'number' && selectedCount > targeting.maximumTargetCount) {
    return false
  }

  return true
}

export { canConfirmEffectTargetSelection, resolveEffectTargetRequiredCount }
