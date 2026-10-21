import type { ButtonHTMLAttributes, ReactNode, RefObject } from 'react'
import type { ICardCatalogPredicateProperty } from '@/services/api/types/cardCatalog'
import type { ICardCatalogListItemResponse } from '@/types/cardCatalog'

export type ICardAdminSortOption = {
  value: string
  label: string
}

export type ICardAdminFilterOption = {
  value: string
  label: string
}

export type ICardAdminServerParams = {
  page: number
  pageSize: number
  sort: string
}

export type ICardAdminLocalFilters = {
  searchText: string
  type: string[]
  color: string[]
  includeNonDeckableTypes: boolean
}

export type ICardAdminSelectionState = {
  selectedCardId: string | null
}

export type ICardAdminViewState = ICardAdminServerParams & ICardAdminLocalFilters & ICardAdminSelectionState

export type ICardAdminViewActions = {
  setPage: (value: number) => void
  setPageSize: (value: number) => void
  setSort: (value: string) => void
  setSearchText: (value: string) => void
  setTypeFilter: (value: string[]) => void
  setColorFilter: (value: string[]) => void
  setIncludeNonDeckableTypes: (value: boolean) => void
  selectCard: (cardId: string) => void
  clearSelection: () => void
}

export type ICardAdminViewModel = ICardAdminViewState & ICardAdminViewActions


export type ICardAdminSelectOption = {
  value: string
  label: ReactNode
  disabled: boolean
}

export type ICardAdminSelectProps = {
  value: string
  onValueChange: (value: string) => void
  children?: ReactNode
  disabled?: boolean
  className?: string
  id?: string
  title?: string
  'aria-label'?: string
}

export type ICardAdminToggleSwitchProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
  trackClassName?: string
  thumbClassName?: string
}

export type CardAdminRemoveButtonVariant = 'inline' | 'chip'

export interface ICardAdminRemoveButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  ariaLabel: string
  variant?: CardAdminRemoveButtonVariant
  children?: ReactNode
}

export type ICardAdminTokenFieldProps = {
  id: string
  values: string[]
  onChange: (values: string[]) => void
  placeholder: string
  suggestions?: string[]
  disabled?: boolean
  ariaLabel?: string
  chipTestId?: string
  maxEntries?: number
}

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

export type ICountConstraintMode = 'Exact' | 'Minimum' | 'Maximum' | 'All'

export type ICountConstraintFieldProps = {
  mode: ICountConstraintMode
  value: number | null
  onModeChange: (mode: ICountConstraintMode) => void
  onValueChange: (value: number | null) => void
  modeLabel?: string
  valueLabel?: string
  min?: number
  step?: number
  inputMode?: 'numeric' | 'decimal'
  placeholder?: string
  className?: string
  selectClassName?: string
  inputClassName?: string
  trailingContent?: ReactNode
}


export type ICardAdminFilterPanelProps = {
  searchText: string
  typeValues: string[]
  colorValues: string[]
  sortValue: string
  typeOptions: ICardAdminFilterOption[]
  colorOptions: ICardAdminFilterOption[]
  sortOptions: readonly ICardAdminSortOption[]
  onSearchTextChange: (value: string) => void
  onTypeChange: (value: string[]) => void
  onColorChange: (value: string[]) => void
  onSortChange: (value: string) => void
  includeNonDeckableTypes?: boolean
  onIncludeNonDeckableTypesChange?: (value: boolean) => void
}

export type ICardAdminCardGridProps = {
  cards: ICardCatalogListItemResponse[]
  selectedCardId: string | null
  onSelectCard: (cardId: string) => void
  selectedCountByCardId?: ReadonlyMap<string, number>
  maxCopies?: number
  onAddCard?: (cardId: string) => void
  onRemoveCard?: (cardId: string) => void
}

export type ICardAdminCardTileProps = {
  card: ICardCatalogListItemResponse
  isSelected: boolean
  onSelect: (cardId: string) => void
  selectedCount?: number
  maxCopies?: number
  onAdd?: (cardId: string) => void
  onRemove?: (cardId: string) => void
}

export type ICardAdminCatalogPaneProps = {
  cards: ICardCatalogListItemResponse[]
  selectedCardId: string | null
  isLoading: boolean
  isError: boolean
  isFetchingNextPage: boolean
  hasNextPage: boolean
  onSelectCard: (cardId: string) => void
  onFetchNextPage: () => void | Promise<unknown>
  listScrollContainerRef: RefObject<HTMLDivElement | null>
  loadMoreSentinelRef: RefObject<HTMLDivElement | null>
  selectedCountByCardId?: ReadonlyMap<string, number>
  maxCopies?: number
  onAddCard?: (cardId: string) => void
  onRemoveCard?: (cardId: string) => void
}

export type ICardAdminPaginationFooterProps = {
  sentinelRef: RefObject<HTMLDivElement | null>
  isFetchingNextPage: boolean
  hasNextPage: boolean
  hasCards: boolean
  onFetchNextPage: () => void | Promise<unknown>
}
