export const TARGET_RANGE_OPTIONS = ['Self', 'Opponent', 'Any'] as const

export const EXECUTION_TARGET_SOURCE_OPTIONS = [
  'Selected Targets',
  'Source Card',
  'None',
] as const

export const EXECUTION_FLOW_MODE_OPTIONS = ['Per Step', 'Atomic Chain'] as const

export const REVEAL_TIMING_MODE_OPTIONS = ['Reveal First', 'Reveal Last'] as const

export const RULE_OPERATOR_OPTIONS = ['Any', 'All'] as const

export const PLAYER_ZONE_OPTIONS = [
  'Hand',
  'Deck',
  'Trash',
  'Exile Zone',
  'Support Zone',
  'Character Field',
  'Leader',
] as const

export const REVEAL_ZONE_OPTIONS = ['Hand', 'Deck', 'Support Zone'] as const

export const TRIBUTE_ROLE_OPTIONS = ['Tribute Material', 'Summon Candidate'] as const

export const TARGET_LOCATION_SELECTOR_KIND_OPTIONS = [
  'Any',
  'Support Slot Index',
  'Deck Top',
] as const

export const TARGET_TYPE_OPTIONS = ['Selected Targets', 'Leader'] as const

export const TARGET_RANGE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Self': 'admin.options.targetRange.self',
  'Opponent': 'admin.options.targetRange.opponent',
  'Any': 'admin.options.targetRange.any',
}

export const EXECUTION_TARGET_SOURCE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Selected Targets': 'admin.options.executionTargetSource.selectedTargets',
  'Source Card': 'admin.options.executionTargetSource.sourceCard',
  'None': 'admin.options.executionTargetSource.none',
}

export const EXECUTION_FLOW_MODE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Per Step': 'admin.options.executionFlowMode.perStep',
  'Atomic Chain': 'admin.options.executionFlowMode.atomicChain',
}

export const REVEAL_TIMING_MODE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Reveal First': 'admin.options.revealTiming.revealFirst',
  'Reveal Last': 'admin.options.revealTiming.revealLast',
}

export const RULE_OPERATOR_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Any': 'admin.options.ruleOperator.any',
  'All': 'admin.options.ruleOperator.all',
}

export const PLAYER_ZONE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Hand': 'admin.options.playerZone.hand',
  'Deck': 'admin.options.playerZone.deck',
  'Trash': 'admin.options.playerZone.trash',
  'Exile Zone': 'admin.options.playerZone.exileZone',
  'Support Zone': 'admin.options.playerZone.supportZone',
  'Character Field': 'admin.options.playerZone.characterField',
  'Leader': 'admin.options.playerZone.leader',
}

export const REVEAL_ZONE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Hand': 'admin.options.revealZone.hand',
  'Deck': 'admin.options.revealZone.deck',
  'Support Zone': 'admin.options.revealZone.supportZone',
}

export const TRIBUTE_ROLE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Tribute Material': 'admin.options.tributeRole.tributeMaterial',
  'Summon Candidate': 'admin.options.tributeRole.summonCandidate',
}

export const TARGET_LOCATION_SELECTOR_KIND_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Any': 'admin.options.locationSelectorKind.any',
  'Support Slot Index': 'admin.options.locationSelectorKind.supportSlotIndex',
  'Deck Top': 'admin.options.locationSelectorKind.deckTop',
}

export const TARGET_TYPE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Selected Targets': 'admin.options.targetType.selectedTargets',
  'Leader': 'admin.options.targetType.leader',
}
