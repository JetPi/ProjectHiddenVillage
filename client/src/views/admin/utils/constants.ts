import type {
  ICardAdminFilterOption,
  ICardAdminSortOption,
} from '@/views/admin/types/cardAdminView'

export const SORT_OPTIONS: readonly ICardAdminSortOption[] = [
  { value: 'cardId', label: 'Card ID (A-Z)' },
  { value: '-cardId', label: 'Card ID (Z-A)' },
  { value: 'displayName', label: 'Display Name (A-Z)' },
  { value: '-displayName', label: 'Display Name (Z-A)' },
  { value: 'type', label: 'Type (A-Z)' },
  { value: '-updatedAtUtc', label: 'Updated (Newest)' },
]

export const ALL_FILTER_OPTION: ICardAdminFilterOption = { value: 'all', label: 'All' }
