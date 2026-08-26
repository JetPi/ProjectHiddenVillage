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
  'Id',
  'Original Id',
  'Display Name',
  'Name',
  'Trait',
  'Type',
  'Color',
  'Power',
  'Damage',
  'Health',
  'Current Health',
  'Owner Player Id',
  'Controller Player Id',
  'Is Exhausted',
  'Is Rested',
  'Cannot Be Normal Summoned',
]
