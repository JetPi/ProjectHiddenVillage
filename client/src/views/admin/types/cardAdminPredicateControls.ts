import type { ICardCatalogPredicateProperty } from '@/services/api/types/cardCatalog'

export interface ICardAdminPredicateControlsProps {
  predicateProperty: ICardCatalogPredicateProperty
  predicateOperator: string
  predicateEntries: string[]
  onPropertyChange: (property: ICardCatalogPredicateProperty) => void
  onOperatorChange: (operator: string) => void
  onAddValue: (value: string) => void
}

export interface ICardAdminPredicateFooterProps {
  predicateEntries: string[]
  ignoreCase: boolean
  onRemoveEntry: (entryIndex: number) => void
  onIgnoreCaseChange: (checked: boolean) => void
  onRemovePredicate: () => void
}
