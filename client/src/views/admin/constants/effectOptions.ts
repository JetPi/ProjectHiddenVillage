export const RUNTIME_EFFECT_OPTIONS = [
  'Destroy Card',
  'Negate Effect',
  'Interrupt Attack',
  'Gain Effect',
  'Change Values',
  'Alter Resources',
  'Tribute',
  'Search Card',
  'Freeze Card',
  'Reveal Card',
  'Summon Card',
  'Move Card',
] as const

export const EFFECT_KIND_OPTIONS = [
  'Support',
  'Recovery',
  'Summon Requirement',
  'Rush',
  'Activated',
] as const

export const EFFECT_TIMING_OPTIONS = [
  'Activate Main',
  'During Opponent Attack',
  'Support Activated',
  'Quick',
  'On Summon',
  'During Your Main',
  'Your Turn',
  'When Attacking',
] as const

export const EFFECT_DURATION_MODE_OPTIONS = [
  'Instant',
  'During This Turn',
  'During Opponent Next Turn',
  'Until the End of your Next Turn',
  'During This Battle',
  'Continuous',
] as const

export const RESTRICTIONS_OPTIONS = ['None', 'Once Per Turn'] as const
