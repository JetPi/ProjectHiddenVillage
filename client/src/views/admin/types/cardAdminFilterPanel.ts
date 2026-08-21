import type {
  ICardAdminFilterOption,
  ICardAdminSortOption,
} from '@/views/admin/types/cardAdminView'

export type ICardAdminFilterPanelProps = {
  searchText: string
  typeValue: string
  colorValue: string
  sortValue: string
  typeOptions: ICardAdminFilterOption[]
  colorOptions: ICardAdminFilterOption[]
  sortOptions: readonly ICardAdminSortOption[]
  onSearchTextChange: (value: string) => void
  onTypeChange: (value: string) => void
  onColorChange: (value: string) => void
  onSortChange: (value: string) => void
}
