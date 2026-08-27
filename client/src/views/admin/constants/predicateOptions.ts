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
