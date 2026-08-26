import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui'
import { useInfiniteCardCatalogQuery } from '@/services/queries/cardQueries'
import {
  CardAdminCatalogPane,
  CardAdminDetailPane,
  CardAdminFilterPanel,
} from '@/views/admin/components'
import { useCardAdminViewModel } from '@/views/admin/model/useCardAdminViewModel'
import { SORT_OPTIONS } from '@/views/admin/constants'
import { buildUniqueFilterOptions, normalizeFilterValue } from '@/views/admin/utils/filterNormalization'

export function CardAdminView() {
  const viewModel = useCardAdminViewModel()

  const catalogPageQuery = useInfiniteCardCatalogQuery(
    {
      pageSize: viewModel.pageSize,
      sort: viewModel.sort,
    },
    {
      enabled: true,
    },
  )

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const listScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = catalogPageQuery

  const allLoadedItems = useMemo(
    () =>
      (catalogPageQuery.data?.pages ?? [])
        .flatMap((pageResult) => pageResult.items)
        .filter((card, index, cards) => cards.findIndex((entry) => entry.id === card.id) === index),
    [catalogPageQuery.data?.pages],
  )

  const typeOptions = useMemo(
    () => buildUniqueFilterOptions(allLoadedItems.map((card) => card.type)),
    [allLoadedItems],
  )
  const colorOptions = useMemo(
    () => buildUniqueFilterOptions(allLoadedItems.map((card) => card.color)),
    [allLoadedItems],
  )

  const filteredCards = useMemo(() => {
    const searchTerm = viewModel.searchText.trim().toLowerCase()
    const typeFilters = viewModel.type
    const colorFilters = viewModel.color

    return allLoadedItems.filter((card) => {
      const normalizedType = normalizeFilterValue(card.type)
      if (typeFilters.length > 0 && !typeFilters.includes(normalizedType)) {
        return false
      }

      const normalizedColor = normalizeFilterValue(card.color)
      if (colorFilters.length > 0 && !colorFilters.includes(normalizedColor)) {
        return false
      }

      if (!searchTerm) {
        return true
      }

      const searchFields = [card.id, card.displayName, card.type, card.color]
      return searchFields.some((field) => field.toLowerCase().includes(searchTerm))
    })
  }, [viewModel.searchText, viewModel.type, viewModel.color, allLoadedItems])

  useEffect(() => {
    if (!viewModel.selectedCardId) {
      return
    }

    const hasSelectedCard = filteredCards.some((card) => card.id === viewModel.selectedCardId)
    if (!hasSelectedCard) {
      viewModel.clearSelection()
    }
  }, [filteredCards, viewModel])

  useEffect(() => {
    const sentinelElement = loadMoreSentinelRef.current
    const listScrollContainer = listScrollContainerRef.current
    if (!sentinelElement || !hasNextPage) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || isFetchingNextPage) {
          return
        }

        void fetchNextPage()
      },
      {
        root: listScrollContainer,
        rootMargin: '300px 0px 300px 0px',
        threshold: 0.01,
      },
    )

    observer.observe(sentinelElement)

    return () => {
      observer.disconnect()
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  const selectedCard = useMemo(
    () => filteredCards.find((card) => card.id === viewModel.selectedCardId) ?? null,
    [filteredCards, viewModel.selectedCardId],
  )

  return (
    <PageShell
      compact
      fullBleed
      edgeToEdge
      className="h-dvh overflow-hidden"
    >
      <div className="h-full w-full">
        <div className="grid h-full min-h-0 gap-0 [grid-template-columns:minmax(22rem,38rem)_minmax(40rem,1fr)] max-[62rem]:[grid-template-columns:22rem_minmax(0,1fr)]">
          <aside className="themed-scrollbar flex h-full min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
            <CardAdminFilterPanel
              searchText={viewModel.searchText}
              typeValues={viewModel.type}
              colorValues={viewModel.color}
              sortValue={viewModel.sort}
              typeOptions={typeOptions}
              colorOptions={colorOptions}
              sortOptions={SORT_OPTIONS}
              onSearchTextChange={viewModel.setSearchText}
              onTypeChange={viewModel.setTypeFilter}
              onColorChange={viewModel.setColorFilter}
              onSortChange={viewModel.setSort}
            />

            <CardAdminCatalogPane
              cards={filteredCards}
              selectedCardId={viewModel.selectedCardId}
              isLoading={isLoading}
              isError={isError}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={hasNextPage ?? false}
              onSelectCard={viewModel.selectCard}
              onFetchNextPage={fetchNextPage}
              listScrollContainerRef={listScrollContainerRef}
              loadMoreSentinelRef={loadMoreSentinelRef}
            />
          </aside>

          <Panel className="themed-scrollbar m-3 h-[calc(100%-1.5rem)] min-h-0 overflow-y-auto px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Card Admin</h1>
              <Link to="/" className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline">
                Back to Login
              </Link>
            </div>
            <CardAdminDetailPane selectedCard={selectedCard} />
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
