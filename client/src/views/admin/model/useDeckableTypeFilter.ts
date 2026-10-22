import { useCallback, useMemo } from 'react'
import { TYPE_FILTER_OPTIONS } from '@/views/admin/constants'
import type { ICardAdminFilterOption } from '@/views/admin/types/cardAdminViewTypes'
import {
  isNonDeckableCardTypeFilter,
  resolveDeckCatalogTypeFilter,
} from '@/views/admin/utils/deckCatalogTypeFilters'

/**
 * The slice of a catalogue screen's filter state this hook needs. Both the deck builder and the
 * card admin expose these four entries, so the shared behaviour lives here instead of in each view.
 */
export type IDeckableTypeFilterSource = {
  type: string[]
  includeNonDeckableTypes: boolean
  setTypeFilter: (value: string[]) => void
  setIncludeNonDeckableTypes: (value: boolean) => void
}

export type IDeckableTypeFilter = {
  /** `types` value for the catalogue request: the author's selection, narrowed to deckable types by default. */
  catalogTypes: string[]
  /** Type options the filter panel may offer. Chakra/Summon disappear while they are excluded. */
  catalogTypeOptions: readonly ICardAdminFilterOption[]
  includeNonDeckableTypes: boolean
  /** Flips the toggle and, when turning it off, drops selected Chakra/Summon types so no dead chip remains. */
  onIncludeNonDeckableTypesChange: (value: boolean) => void
}

export function useDeckableTypeFilter({
  type,
  includeNonDeckableTypes,
  setTypeFilter,
  setIncludeNonDeckableTypes,
}: IDeckableTypeFilterSource): IDeckableTypeFilter {
  const catalogTypes = useMemo(
    () => resolveDeckCatalogTypeFilter(type, includeNonDeckableTypes),
    [type, includeNonDeckableTypes],
  )

  const catalogTypeOptions = useMemo(
    () =>
      TYPE_FILTER_OPTIONS.filter(
        (option) => includeNonDeckableTypes || !isNonDeckableCardTypeFilter(option.value),
      ),
    [includeNonDeckableTypes],
  )

  const onIncludeNonDeckableTypesChange = useCallback(
    (nextValue: boolean) => {
      setIncludeNonDeckableTypes(nextValue)

      if (nextValue) {
        return
      }

      setTypeFilter(type.filter((entry) => !isNonDeckableCardTypeFilter(entry)))
    },
    [type, setIncludeNonDeckableTypes, setTypeFilter],
  )

  return {
    catalogTypes,
    catalogTypeOptions,
    includeNonDeckableTypes,
    onIncludeNonDeckableTypesChange,
  }
}
