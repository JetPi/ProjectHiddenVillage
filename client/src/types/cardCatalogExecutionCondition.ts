export const CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS = [
  'isSecondTurnOrLater',
  'selectedOption',
  'summonTargetId',
  'moveCardMode',
  'moveCardDrawCount',
  'moveCardSourceZone',
  'moveCardDestinationZone',
  'moveCardDestinationIndex',
  'moveCardDestinationPlayerId',
  'moveCardAllowCrossPlayer',
] as const

export type ICardCatalogEffectExecutionConditionArgumentKey =
  typeof CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS[number]
