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
  'Lock Chakra Recovery',
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

/**
 * When an effect collects its target selection. 'Prompted' defers the pick to execution time, so an earlier
 * step of the same chain can change the candidate pool first ("draw 1 card, then place 1 card from your hand
 * on top of your deck"). Values are the exact EffectSelectionTiming enum names the engine round-trips.
 */
export const SELECTION_TIMING_OPTIONS = ['Upfront', 'Prompted'] as const

/**
 * Copy bucket for a prompted selection. The client owns the wording (EFFECT_SELECTION_PROMPT_COPY), so a new
 * bucket here only needs a matching client entry. Values are the exact EffectSelectionPromptKind enum names.
 */
export const SELECTION_PROMPT_KIND_OPTIONS = [
  'Generic',
  'PlaceOnDeckTop',
  'PlaceOnDeckBottom',
  'DiscardFromHand',
  'ReturnToHand',
  'SearchDeck',
] as const
