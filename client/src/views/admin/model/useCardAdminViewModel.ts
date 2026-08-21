import { useShallow } from 'zustand/react/shallow'
import { useCardAdminViewStore } from '@/state/cardAdminViewStore'
import type { ICardAdminViewModel } from '@/views/admin/types/cardAdminView'

export function useCardAdminViewModel(): ICardAdminViewModel {
  const viewModel = useCardAdminViewStore(
    useShallow((state) => ({
      page: state.page,
      pageSize: state.pageSize,
      sort: state.sort,
      searchText: state.searchText,
      type: state.type,
      color: state.color,
      selectedCardId: state.selectedCardId,
      setPage: state.setPage,
      setPageSize: state.setPageSize,
      setSort: state.setSort,
      setSearchText: state.setSearchText,
      setTypeFilter: state.setTypeFilter,
      setColorFilter: state.setColorFilter,
      selectCard: state.selectCard,
      clearSelection: state.clearSelection,
    })),
  )

  return viewModel
}
