import type { IEffectTargetingState } from '@/views/game/types'

/**
 * How many targets this effect requires before it may be submitted. Range effects declare only a
 * maximum ("choose up to 2"), so the floor is the server's minimum when present and otherwise a single
 * target: activating an effect and choosing nothing is never the intent.
 */
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
