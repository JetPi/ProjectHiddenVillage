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
  'SummonFromZone',
  'DestroyFromZone',
  'FreezeFromZone',
] as const

/** Display labels for the runtime effect `value`s above; the values are never translated. */
export const RUNTIME_EFFECT_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Destroy Card': 'admin.options.runtimeEffect.destroyCard',
  'Negate Effect': 'admin.options.runtimeEffect.negateEffect',
  'Interrupt Attack': 'admin.options.runtimeEffect.interruptAttack',
  'Gain Effect': 'admin.options.runtimeEffect.gainEffect',
  'Change Values': 'admin.options.runtimeEffect.changeValues',
  'Alter Resources': 'admin.options.runtimeEffect.alterResources',
  'Tribute': 'admin.options.runtimeEffect.tribute',
  'Search Card': 'admin.options.runtimeEffect.searchCard',
  'Freeze Card': 'admin.options.runtimeEffect.freezeCard',
  'Reveal Card': 'admin.options.runtimeEffect.revealCard',
  'Summon Card': 'admin.options.runtimeEffect.summonCard',
  'Move Card': 'admin.options.runtimeEffect.moveCard',
  'Lock Chakra Recovery': 'admin.options.runtimeEffect.lockChakraRecovery',
}

export const EFFECT_KIND_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Support': 'admin.options.effectKind.support',
  'Recovery': 'admin.options.effectKind.recovery',
  'Summon Requirement': 'admin.options.effectKind.summonRequirement',
  'Rush': 'admin.options.effectKind.rush',
  'Activated': 'admin.options.effectKind.activated',
}

export const EFFECT_TIMING_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Activate Main': 'admin.options.timing.activateMain',
  'During Opponent Attack': 'admin.options.timing.duringOpponentAttack',
  'Support Activated': 'admin.options.timing.supportActivated',
  'Quick': 'admin.options.timing.quick',
  'On Summon': 'admin.options.timing.onSummon',
  'During Your Main': 'admin.options.timing.duringYourMain',
  'Your Turn': 'admin.options.timing.yourTurn',
  'When Attacking': 'admin.options.timing.whenAttacking',
}

export const EFFECT_DURATION_MODE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Instant': 'admin.options.duration.instant',
  'During This Turn': 'admin.options.duration.duringThisTurn',
  'During Opponent Next Turn': 'admin.options.duration.duringOpponentNextTurn',
  'Until the End of your Next Turn': 'admin.options.duration.untilEndOfYourNextTurn',
  'During This Battle': 'admin.options.duration.duringThisBattle',
  'Continuous': 'admin.options.duration.continuous',
}

export const RESTRICTIONS_LABEL_KEYS: Readonly<Record<string, string>> = {
  'None': 'admin.options.restrictions.none',
  'Once Per Turn': 'admin.options.restrictions.oncePerTurn',
}

export const SELECTION_TIMING_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Upfront': 'admin.options.selectionTiming.upfront',
  'Prompted': 'admin.options.selectionTiming.prompted',
}

export const SELECTION_PROMPT_KIND_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Generic': 'admin.options.selectionPromptKind.generic',
  'PlaceOnDeckTop': 'admin.options.selectionPromptKind.placeOnDeckTop',
  'PlaceOnDeckBottom': 'admin.options.selectionPromptKind.placeOnDeckBottom',
  'DiscardFromHand': 'admin.options.selectionPromptKind.discardFromHand',
  'ReturnToHand': 'admin.options.selectionPromptKind.returnToHand',
  'SearchDeck': 'admin.options.selectionPromptKind.searchDeck',
  'SummonFromZone': 'admin.options.selectionPromptKind.summonFromZone',
  'DestroyFromZone': 'admin.options.selectionPromptKind.destroyFromZone',
  'FreezeFromZone': 'admin.options.selectionPromptKind.freezeFromZone',
}
