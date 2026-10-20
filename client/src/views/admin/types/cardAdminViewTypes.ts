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
  selectCard: (cardId: string) => void
  clearSelection: () => void
}

export type ICardAdminViewModel = ICardAdminViewState & ICardAdminViewActions

// Shared admin controls

export type ICardAdminSelectOption = {
  value: string
  label: ReactNode
  disabled: boolean
}

/**
 * Props of the admin dropdown.
 *
 * The option list is declared as `<option>` children exactly like a native `<select>`, but the control is a
 * custom listbox (see `CardAdminSelect`), so the handler receives the chosen value directly instead of a
 * change event.
 */
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
  /** Values the catalogue already knows; typing ranks them and shows the closest matches under the input. */
  suggestions?: string[]
  disabled?: boolean
  ariaLabel?: string
  /** Lets an e2e test count the committed chips without matching on their text. */
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

// Catalog panes

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
}

/**
 * Quantity selection is opt-in. The card editor keeps its single selection (clicking selects a card for the detail
 * pane); the deck builder passes `selectedCountByCardId` and gets a tile that adds a copy per click and shows a
 * count with a remove control. Deliberately no `maxCopies` enforcement in the UI: a click always adds, and the
 * draft's validation list is what says the deck has gone over the limit.
 */
export type ICardAdminCardGridProps = {
  cards: ICardCatalogListItemResponse[]
  selectedCardId: string | null
  onSelectCard: (cardId: string) => void
  selectedCountByCardId?: ReadonlyMap<string, number>
  /** Only used to tone the count chip; the click is never refused. */
  maxCopies?: number
  onAddCard?: (cardId: string) => void
  onRemoveCard?: (cardId: string) => void
}

export type ICardAdminCardTileProps = {
  /** The lean listing row: a tile renders the name, id, type, colour and art, and nothing else. */
  card: ICardCatalogListItemResponse
  isSelected: boolean
  onSelect: (cardId: string) => void
  /** How many copies the draft holds; in quantity mode the tile body adds one and a chip removes one. */
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
