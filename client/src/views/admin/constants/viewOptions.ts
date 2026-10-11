import type {
  ICardAdminFilterOption,
  ICardAdminSortOption,
} from '@/views/admin/types/cardAdminViewTypes'

export const SORT_OPTIONS: readonly ICardAdminSortOption[] = [
  { value: 'cardId', label: 'Card ID (A-Z)' },
  { value: '-cardId', label: 'Card ID (Z-A)' },
  { value: 'displayName', label: 'Display Name (A-Z)' },
  { value: '-displayName', label: 'Display Name (Z-A)' },
  { value: 'type', label: 'Type (A-Z)' },
  { value: '-updatedAtUtc', label: 'Updated (Newest)' },
]

export const ALL_FILTER_OPTION: ICardAdminFilterOption = {
  value: 'all',
  label: 'All',
}

/** Display labels for the sort/filter `value`s above; the values (what the API receives) never change. */
export const SORT_OPTION_LABEL_KEYS: Readonly<Record<string, string>> = {
  'cardId': 'admin.filters.sortOption.cardIdAsc',
  '-cardId': 'admin.filters.sortOption.cardIdDesc',
  'displayName': 'admin.filters.sortOption.displayNameAsc',
  '-displayName': 'admin.filters.sortOption.displayNameDesc',
  'type': 'admin.filters.sortOption.typeAsc',
  '-updatedAtUtc': 'admin.filters.sortOption.updatedNewest',
}

export const ALL_FILTER_OPTION_LABEL_KEY = 'admin.filters.all'
