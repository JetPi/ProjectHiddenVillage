export const CONDITION_OPTIONS = [
  'isSecondTurnOrLater',
  'isFirstTurn',
  'isYourTurn',
  'isOpponentTurn',
  'hasAttackedThisTurn',
  'hasAvailableChakra',
  'canNormalSummon',
  'hasSummonTarget',
  'hasTributeTargets',
] as const

/**
 * Condition identifiers are server wire values *and* the current display copy, so
 * each label resolves through i18n with an identical English value (translating a
 * future locale must never alter the submitted condition string).
 */
export const CONDITION_LABEL_KEYS: Readonly<Record<string, string>> = {
  'isSecondTurnOrLater': 'admin.options.condition.isSecondTurnOrLater',
  'isFirstTurn': 'admin.options.condition.isFirstTurn',
  'isYourTurn': 'admin.options.condition.isYourTurn',
  'isOpponentTurn': 'admin.options.condition.isOpponentTurn',
  'hasAttackedThisTurn': 'admin.options.condition.hasAttackedThisTurn',
  'hasAvailableChakra': 'admin.options.condition.hasAvailableChakra',
  'canNormalSummon': 'admin.options.condition.canNormalSummon',
  'hasSummonTarget': 'admin.options.condition.hasSummonTarget',
  'hasTributeTargets': 'admin.options.condition.hasTributeTargets',
}
