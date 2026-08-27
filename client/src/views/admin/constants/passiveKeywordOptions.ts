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
