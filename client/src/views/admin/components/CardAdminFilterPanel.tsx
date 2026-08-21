import { FormInput, FormLabel, FormSelect } from '@/components/forms'
import type { ICardAdminFilterPanelProps } from '@/views/admin/types/cardAdminFilterPanel'

export function CardAdminFilterPanel({
  searchText,
  typeValue,
  colorValue,
  sortValue,
  typeOptions,
  colorOptions,
  sortOptions,
  onSearchTextChange,
  onTypeChange,
  onColorChange,
  onSortChange,
}: ICardAdminFilterPanelProps) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-2.5">
      <div className="space-y-1">
        <FormLabel htmlFor="card-admin-search" className="text-[10px] tracking-[0.12em]">
          Search
        </FormLabel>
        <FormInput
          id="card-admin-search"
          value={searchText}
          placeholder="Search"
          onChange={(event) => onSearchTextChange(event.target.value)}
          className="py-2"
        />
      </div>

      <div className="space-y-1">
        <FormLabel htmlFor="card-admin-type-filter" className="text-[10px] tracking-[0.12em]">
          Type
        </FormLabel>
        <FormSelect
          id="card-admin-type-filter"
          value={typeValue}
          options={typeOptions}
          onValueChange={onTypeChange}
          className="py-2"
        />
      </div>

      <div className="space-y-1">
        <FormLabel htmlFor="card-admin-color-filter" className="text-[10px] tracking-[0.12em]">
          Color
        </FormLabel>
        <FormSelect
          id="card-admin-color-filter"
          value={colorValue}
          options={colorOptions}
          onValueChange={onColorChange}
          className="py-2"
        />
      </div>

      <div className="col-span-3 space-y-1">
        <FormLabel htmlFor="card-admin-sort" className="text-[10px] tracking-[0.12em]">
          Sort
        </FormLabel>
        <FormSelect
          id="card-admin-sort"
          value={sortValue}
          options={sortOptions}
          onValueChange={onSortChange}
          className="py-2"
        />
      </div>
    </div>
  )
}
