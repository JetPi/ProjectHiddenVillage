import { Link } from 'react-router-dom'
import { useEffect, useMemo, useRef } from 'react'
import { FormInput, FormLabel, FormSelect } from '@/components/forms'
import { PageShell } from '@/components/layout/PageShell'
import { AppButton, Panel } from '@/components/ui'
import { CardImage } from '@/components/ui/cards'
import { useInfiniteCardCatalogQuery } from '@/services/queries/cardQueries'
import { useCardAdminViewModel } from '@/views/admin/model/useCardAdminViewModel'
import type {
  ICardAdminFilterOption,
  ICardAdminSortOption,
} from '@/views/admin/types/cardAdminView'

const SORT_OPTIONS: readonly ICardAdminSortOption[] = [
  { value: 'cardId', label: 'Card ID (A-Z)' },
  { value: '-cardId', label: 'Card ID (Z-A)' },
  { value: 'displayName', label: 'Display Name (A-Z)' },
  { value: '-displayName', label: 'Display Name (Z-A)' },
  { value: 'type', label: 'Type (A-Z)' },
  { value: '-updatedAtUtc', label: 'Updated (Newest)' },
]

const ALL_FILTER_OPTION: ICardAdminFilterOption = { value: 'all', label: 'All' }

function normalizeFilterValue(value: string | null | undefined): string {
  const normalizedValue = value?.trim().toLowerCase() ?? ''
  return normalizedValue || 'unknown'
}

function toTitleCaseLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter((entry) => entry.length > 0)
    .map((entry) => `${entry[0].toUpperCase()}${entry.slice(1).toLowerCase()}`)
    .join(' ')
}

function buildUniqueFilterOptions(values: string[]): ICardAdminFilterOption[] {
  const normalizedValues = Array.from(new Set(values.map((value) => normalizeFilterValue(value))))
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))

  return [
    ALL_FILTER_OPTION,
    ...normalizedValues.map((value) => ({
      value,
      label: value === 'unknown' ? 'Unknown' : toTitleCaseLabel(value),
    })),
  ]
}

export function CardAdminView() {
  const initialViewModel = useCardAdminViewModel([])

  const catalogPageQuery = useInfiniteCardCatalogQuery(
    {
      pageSize: initialViewModel.pageSize,
      sort: initialViewModel.sort,
    },
    {
      enabled: true,
    },
  )

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const listScrollContainerRef = useRef<HTMLDivElement | null>(null)

  const allLoadedItems = useMemo(
    () =>
      (catalogPageQuery.data?.pages ?? [])
        .flatMap((pageResult) => pageResult.items)
        .filter((card, index, cards) => cards.findIndex((entry) => entry.id === card.id) === index),
    [catalogPageQuery.data?.pages],
  )

  useEffect(() => {
    const sentinelElement = loadMoreSentinelRef.current
    const listScrollContainer = listScrollContainerRef.current
    if (!sentinelElement || !catalogPageQuery.hasNextPage) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || catalogPageQuery.isFetchingNextPage) {
          return
        }

        void catalogPageQuery.fetchNextPage()
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
  }, [catalogPageQuery])

  const typeOptions = useMemo(
    () => buildUniqueFilterOptions(allLoadedItems.map((card) => card.type)),
    [allLoadedItems],
  )
  const colorOptions = useMemo(
    () => buildUniqueFilterOptions(allLoadedItems.map((card) => card.color)),
    [allLoadedItems],
  )

  const filteredCards = useMemo(() => {
    const searchTerm = initialViewModel.searchText.trim().toLowerCase()
    const typeFilter = initialViewModel.type
    const colorFilter = initialViewModel.color

    return allLoadedItems.filter((card) => {
      if (typeFilter !== 'all' && normalizeFilterValue(card.type) !== typeFilter) {
        return false
      }

      if (colorFilter !== 'all' && normalizeFilterValue(card.color) !== colorFilter) {
        return false
      }

      if (!searchTerm) {
        return true
      }

      const searchFields = [card.id, card.displayName, card.type, card.color]
      return searchFields.some((field) => field.toLowerCase().includes(searchTerm))
    })
  }, [initialViewModel.searchText, initialViewModel.type, initialViewModel.color, allLoadedItems])

  const viewModel = useCardAdminViewModel(filteredCards)

  const selectedCard = useMemo(
    () => filteredCards.find((card) => card.id === viewModel.selectedCardId) ?? null,
    [filteredCards, viewModel.selectedCardId],
  )

  const loadedPageCount = catalogPageQuery.data?.pages.length ?? 0
  const latestPage = catalogPageQuery.data?.pages[catalogPageQuery.data.pages.length - 1]
  const totalPages = latestPage?.totalPages ?? 1
  const totalCount = latestPage?.totalCount ?? 0
  const hasMorePages = catalogPageQuery.hasNextPage

  return (
    <PageShell
      compact
      fullBleed
      edgeToEdge
      className="h-dvh overflow-hidden"
    >
      <div className="h-full w-full">
        <div className="grid h-full min-h-0 gap-0 lg:grid-cols-[33%_minmax(0,1fr)]">
          <aside className="themed-scrollbar flex h-full min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
           

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-2.5">
              <div className="space-y-1">
                <FormLabel htmlFor="card-admin-search" className="text-[10px] tracking-[0.12em]">
                  Search
                </FormLabel>
                <FormInput
                  id="card-admin-search"
                  value={viewModel.searchText}
                  placeholder="Search"
                  onChange={(event) => viewModel.setSearchText(event.target.value)}
                  className="py-2"
                />
              </div>

              <div className="space-y-1">
                <FormLabel htmlFor="card-admin-type-filter" className="text-[10px] tracking-[0.12em]">
                  Type
                </FormLabel>
                <FormSelect
                  id="card-admin-type-filter"
                  value={viewModel.type}
                  options={typeOptions}
                  onValueChange={viewModel.setTypeFilter}
                  className="py-2"
                />
              </div>

              <div className="space-y-1">
                <FormLabel htmlFor="card-admin-color-filter" className="text-[10px] tracking-[0.12em]">
                  Color
                </FormLabel>
                <FormSelect
                  id="card-admin-color-filter"
                  value={viewModel.color}
                  options={colorOptions}
                  onValueChange={viewModel.setColorFilter}
                  className="py-2"
                />
              </div>

              <div className="col-span-3 space-y-1">
                <FormLabel htmlFor="card-admin-sort" className="text-[10px] tracking-[0.12em]">
                  Sort
                </FormLabel>
                <FormSelect
                  id="card-admin-sort"
                  value={viewModel.sort}
                  options={SORT_OPTIONS}
                  onValueChange={viewModel.setSort}
                  className="py-2"
                />
              </div>
            </div>

            <div
              ref={listScrollContainerRef}
              className="themed-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]"
            >
              {catalogPageQuery.isLoading ? (
                <div className="bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-secondary)]">Loading cards...</div>
              ) : null}

              {catalogPageQuery.isError ? (
                <div className="bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                  Failed to load cards. Try refreshing this page.
                </div>
              ) : null}

              {!catalogPageQuery.isLoading && !catalogPageQuery.isError ? (
                filteredCards.length === 0 ? (
                  <div className="bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-secondary)]">
                    No cards matched your filters on this page.
                  </div>
                ) : (
                  <ul className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredCards.map((card) => {
                      const isSelected = card.id === viewModel.selectedCardId

                      return (
                        <li key={card.id}>
                          <button
                            type="button"
                            onClick={() => viewModel.selectCard(card.id)}
                            className={`w-full rounded-xl border p-2 text-left transition-colors ${
                              isSelected
                                ? 'border-[var(--button-primary-bg)] bg-[var(--button-primary-bg)]/10 shadow-[0_0_0_1px_var(--button-primary-bg)]'
                                : 'border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="aspect-[5/7] w-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
                                <CardImage
                                  src={card.image}
                                  alt={`${card.displayName} card art`}
                                  className="h-full w-full rounded-none object-cover"
                                  fallbackLabel={card.displayName}
                                />
                              </div>

                              <div className="space-y-1 px-1 pb-1">
                                <p className="line-clamp-1 text-sm font-semibold text-[var(--text-primary)]">{card.displayName}</p>
                                <p className="text-xs text-[var(--text-secondary)]">{card.id}</p>
                                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                                  <span className="line-clamp-1">{card.type}</span>
                                  <span>{card.color}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )
              ) : null}

              {!catalogPageQuery.isLoading && !catalogPageQuery.isError ? (
                <div className="px-3 pb-4">
                  <div ref={loadMoreSentinelRef} className="h-2 w-full" aria-hidden="true" />

                  {catalogPageQuery.isFetchingNextPage ? (
                    <p className="mt-2 text-center text-xs text-[var(--text-secondary)]">Loading more cards...</p>
                  ) : null}

                  {!catalogPageQuery.isFetchingNextPage && hasMorePages ? (
                    <div className="mt-2 flex justify-center">
                      <AppButton variant="ghost" onClick={() => void catalogPageQuery.fetchNextPage()}>
                        Load More
                      </AppButton>
                    </div>
                  ) : null}

                  {!catalogPageQuery.isFetchingNextPage && !hasMorePages && filteredCards.length > 0 ? (
                    <p className="mt-2 text-center text-xs text-[var(--text-secondary)]">You reached the end of the catalog.</p>
                  ) : null}
                </div>
              ) : null}
            </div>

          </aside>

          <Panel className="themed-scrollbar m-3 h-[calc(100%-1.5rem)] min-h-0 overflow-y-auto px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">Card Admin</h1>
              <Link to="/" className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline">
                Back to Login
              </Link>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Effect Editor Workspace</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Card details preview shown here while effect editor controls are being implemented.
              </p>

              {selectedCard ? (
                <div className="mt-3 space-y-4 text-sm text-[var(--text-secondary)]">
                  <div className="aspect-[5/7] max-w-[280px] overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]">
                    <CardImage
                      src={selectedCard.image}
                      alt={`${selectedCard.displayName} selected card art`}
                      className="h-full w-full rounded-none object-cover"
                      fallbackLabel={selectedCard.displayName}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <p>
                      <span className="font-semibold text-[var(--text-primary)]">ID:</span> {selectedCard.id}
                    </p>
                    <p>
                      <span className="font-semibold text-[var(--text-primary)]">Type:</span> {selectedCard.type}
                    </p>
                    <p className="sm:col-span-2">
                      <span className="font-semibold text-[var(--text-primary)]">Name:</span> {selectedCard.displayName}
                    </p>
                    <p>
                      <span className="font-semibold text-[var(--text-primary)]">Color:</span> {selectedCard.color}
                    </p>
                    <p>
                      <span className="font-semibold text-[var(--text-primary)]">Power / Damage:</span> {selectedCard.power} / {selectedCard.damage}
                    </p>
                    <p>
                      <span className="font-semibold text-[var(--text-primary)]">Effects:</span> {selectedCard.effects.length}
                    </p>
                  </div>

                  <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-xs text-[var(--text-secondary)]">
                    Reserved editor space: this pane is intentionally sized to accommodate the upcoming effect composition controls.
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-sm text-[var(--text-secondary)]">Select a card from the left rail to prepare editing.</p>
                  <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-xs text-[var(--text-secondary)]">
                    This right-side panel is the main editor body where effect-edit controls will be added next.
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
