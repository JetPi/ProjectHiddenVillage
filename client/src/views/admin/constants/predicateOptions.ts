import type { ICardCatalogPredicateProperty } from '@/services/api/types/cardCatalog'

export const MATCH_MODE_OPTIONS = ['Any', 'All'] as const

export const PREDICATE_OPERATOR_OPTIONS = [
  'Equals',
  'Not Equals',
  'Greater Than',
  'Greater Than Or Equal',
  'Less Than',
  'Less Than Or Equal',
  'Contains',
  'In',
] as const

export const PREDICATE_PROPERTY_OPTIONS: ReadonlyArray<ICardCatalogPredicateProperty> = [
  'Self',
  'Name',
  'Trait',
  'Type',
  'Color',
  'Power',
  'Damage',
  'Health',
  'Current Health',
  'Is Exhausted',
  'Is Rested',
]

export const PREDICATE_NUMERIC_PROPERTY_OPTIONS: ReadonlyArray<ICardCatalogPredicateProperty> = [
  'Power',
  'Damage',
  'Health',
  'Current Health',
]

export const PREDICATE_CARD_TYPE_VALUE_OPTIONS = [
  { value: 'Leader', label: 'Leader' },
  { value: 'Character', label: 'Character' },
  { value: 'ExCharacter', label: 'EX Character' },
  { value: 'Chakra', label: 'Chakra' },
  { value: 'Summon', label: 'Summon' },
] as const

export const PREDICATE_CARD_COLOR_VALUE_OPTIONS = [
  { value: 'Red', label: 'Red' },
  { value: 'Blue', label: 'Blue' },
  { value: 'Green', label: 'Green' },
  { value: 'NotApplicable', label: 'N/A' },
] as const

/** Display labels for the predicate `value`s above; the values are never translated. */
export const MATCH_MODE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Any': 'admin.options.matchMode.any',
  'All': 'admin.options.matchMode.all',
}

export const PREDICATE_OPERATOR_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Equals': 'admin.options.predicateOperator.equals',
  'Not Equals': 'admin.options.predicateOperator.notEquals',
  'Greater Than': 'admin.options.predicateOperator.greaterThan',
  'Greater Than Or Equal': 'admin.options.predicateOperator.greaterThanOrEqual',
  'Less Than': 'admin.options.predicateOperator.lessThan',
  'Less Than Or Equal': 'admin.options.predicateOperator.lessThanOrEqual',
  'Contains': 'admin.options.predicateOperator.contains',
  'In': 'admin.options.predicateOperator.in',
}

export const PREDICATE_PROPERTY_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Self': 'admin.options.predicateProperty.self',
  'Name': 'admin.options.predicateProperty.name',
  'Trait': 'admin.options.predicateProperty.trait',
  'Type': 'admin.options.predicateProperty.type',
  'Color': 'admin.options.predicateProperty.color',
  'Power': 'admin.options.predicateProperty.power',
  'Damage': 'admin.options.predicateProperty.damage',
  'Health': 'admin.options.predicateProperty.health',
  'Current Health': 'admin.options.predicateProperty.currentHealth',
  'Is Exhausted': 'admin.options.predicateProperty.isExhausted',
  'Is Rested': 'admin.options.predicateProperty.isRested',
}

export const PREDICATE_CARD_TYPE_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Leader': 'admin.options.predicateCardType.leader',
  'Character': 'admin.options.predicateCardType.character',
  'ExCharacter': 'admin.options.predicateCardType.exCharacter',
  'Chakra': 'admin.options.predicateCardType.chakra',
  'Summon': 'admin.options.predicateCardType.summon',
}

export const PREDICATE_CARD_COLOR_LABEL_KEYS: Readonly<Record<string, string>> = {
  'Red': 'admin.options.predicateCardColor.red',
  'Blue': 'admin.options.predicateCardColor.blue',
  'Green': 'admin.options.predicateCardColor.green',
  'NotApplicable': 'admin.options.predicateCardColor.notApplicable',
}
