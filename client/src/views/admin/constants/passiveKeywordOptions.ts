export const PASSIVE_MODE_OPTIONS = ['None', 'Continuous', 'Triggered'] as const

export const PASSIVE_SCOPE_OPTIONS = [
  'Source Card Only',
  'Source Controller',
  'Whole Game',
] as const

export const PASSIVE_TRIGGER_KIND_OPTIONS = [
  'Any',
  'Stats Changed',
  'Zone Changed',
  'Turn Changed',
  'Phase Changed',
  'Stack Resolved',
] as const

export const PASSIVE_TARGET_POLICY_OPTIONS = [
  'Source Card',
  'Trigger Selected Targets',
] as const

export const PASSIVE_CONSEQUENCE_EFFECT_OPTIONS = [
  'DestroyCard',
  'NegateCard',
  'SummonCard',
  'TributeSummonCard',
  'ModifyAttribute',
  'GainKeyword',
  'AlterResources',
  'Noop',
] as const

export const KEYWORD_TARGET_TYPE_OPTIONS = ['Source Card', 'Selected Targets'] as const

export const KEYWORD_OPERATION_OPTIONS = ['Add', 'Remove'] as const

export const EFFECT_CONDITION_KEYWORD_OPTIONS_FALLBACK = [
  'Rush',
  'Not Affected By Opponent Support Effects',
] as const

/** Display labels for the passive/keyword `value`s above; the values are never translated. */
export const PASSIVE_MODE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'None': 'admin.options.passiveMode.none',
  'Continuous': 'admin.options.passiveMode.continuous',
  'Triggered': 'admin.options.passiveMode.triggered',
}

export const PASSIVE_SCOPE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Source Card Only': 'admin.options.passiveScope.sourceCardOnly',
  'Source Controller': 'admin.options.passiveScope.sourceController',
  'Whole Game': 'admin.options.passiveScope.wholeGame',
}

export const PASSIVE_TRIGGER_KIND_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Any': 'admin.options.passiveTriggerKind.any',
  'Stats Changed': 'admin.options.passiveTriggerKind.statsChanged',
  'Zone Changed': 'admin.options.passiveTriggerKind.zoneChanged',
  'Turn Changed': 'admin.options.passiveTriggerKind.turnChanged',
  'Phase Changed': 'admin.options.passiveTriggerKind.phaseChanged',
  'Stack Resolved': 'admin.options.passiveTriggerKind.stackResolved',
}

export const PASSIVE_TARGET_POLICY_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Source Card': 'admin.options.passiveTargetPolicy.sourceCard',
  'Trigger Selected Targets': 'admin.options.passiveTargetPolicy.triggerSelectedTargets',
}

export const PASSIVE_CONSEQUENCE_EFFECT_LABEL_KEYS: Readonly<Record<string, string>> = {
  'DestroyCard': 'admin.options.passiveConsequence.destroyCard',
  'NegateCard': 'admin.options.passiveConsequence.negateCard',
  'SummonCard': 'admin.options.passiveConsequence.summonCard',
  'TributeSummonCard': 'admin.options.passiveConsequence.tributeSummonCard',
  'ModifyAttribute': 'admin.options.passiveConsequence.modifyAttribute',
  'GainKeyword': 'admin.options.passiveConsequence.gainKeyword',
  'AlterResources': 'admin.options.passiveConsequence.alterResources',
  'Noop': 'admin.options.passiveConsequence.noop',
}

export const KEYWORD_TARGET_TYPE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Source Card': 'admin.options.keywordTargetType.sourceCard',
  'Selected Targets': 'admin.options.keywordTargetType.selectedTargets',
}

export const KEYWORD_OPERATION_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Add': 'admin.options.keywordOperation.add',
  'Remove': 'admin.options.keywordOperation.remove',
}
