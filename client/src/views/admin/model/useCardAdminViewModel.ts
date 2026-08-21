import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCardAdminViewStore } from '@/state/cardAdminViewStore'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { ICardAdminViewModel } from '@/views/admin/types/cardAdminView'

export function useCardAdminViewModel(filteredCards: ICardCatalogItemResponse[]): ICardAdminViewModel {
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

  useEffect(() => {
    if (!viewModel.selectedCardId) {
      return
    }

    const hasSelectedCard = filteredCards.some((card) => card.id === viewModel.selectedCardId)
    if (!hasSelectedCard) {
      viewModel.clearSelection()
    }
  }, [filteredCards, viewModel])

  return viewModel
}
