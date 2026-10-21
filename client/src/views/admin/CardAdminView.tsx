import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBeforeUnload, useBlocker } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui'
import { useCardCatalogByIdsQuery, useInfiniteCardCatalogQuery } from '@/services/queries/cardQueries'
import {
  CardAdminCatalogPane,
  CardAdminDetailPane,
  CardAdminFilterPanel,
} from '@/views/admin/components'
import { useCardAdminViewModel } from '@/views/admin/model/useCardAdminViewModel'
import { useDeckableTypeFilter } from '@/views/admin/model/useDeckableTypeFilter'
import { COLOR_FILTER_OPTIONS, SORT_OPTIONS } from '@/views/admin/constants'
import type { ICardCatalogListItemResponse } from '@/types/cardCatalog'

const SEARCH_DEBOUNCE_MS = 250

export function CardAdminView() {
  const { t } = useTranslation()
  const viewModel = useCardAdminViewModel()
  const deckableTypes = useDeckableTypeFilter({
    type: viewModel.type,
    includeNonDeckableTypes: viewModel.includeNonDeckableTypes,
    setTypeFilter: viewModel.setTypeFilter,
    setIncludeNonDeckableTypes: viewModel.setIncludeNonDeckableTypes,
  })

  const [debouncedSearch, setDebouncedSearch] = useState(viewModel.searchText)

  useEffect(() => {
    const timeoutHandle = window.setTimeout(() => {
      setDebouncedSearch(viewModel.searchText)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutHandle)
  }, [viewModel.searchText])

  const catalogParams = useMemo(
    () => ({
      pageSize: viewModel.pageSize,
      sort: viewModel.sort,
      search: debouncedSearch,
      types: deckableTypes.catalogTypes,
      colors: viewModel.color,
    }),
    [viewModel.pageSize, viewModel.sort, debouncedSearch, deckableTypes.catalogTypes, viewModel.color],
  )

  const catalogPageQuery = useInfiniteCardCatalogQuery(catalogParams, { enabled: true })

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const listScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = catalogPageQuery

  const catalogCards = useMemo(() => {
    const cardsById = new Map<string, ICardCatalogListItemResponse>()

    for (const page of catalogPageQuery.data?.pages ?? []) {
      for (const card of page.items) {
        cardsById.set(card.id, card)
      }
    }

    return Array.from(cardsById.values())
  }, [catalogPageQuery.data?.pages])

  const selectedCardId = viewModel.selectedCardId
  const selectedCardIds = useMemo(
    () => (selectedCardId ? [selectedCardId] : []),
    [selectedCardId],
  )

  const selectedCardQuery = useCardCatalogByIdsQuery(selectedCardIds)
  const selectedCard = selectedCardQuery.data?.[0] ?? null

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [pendingCardId, setPendingCardId] = useState<string | null>(null)

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

  const blocker = useBlocker(hasUnsavedChanges)

  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (hasUnsavedChanges) {
          event.preventDefault()
        }
      },
      [hasUnsavedChanges],
    ),
  )

  const handleSelectCard = (cardId: string) => {
    if (cardId === selectedCardId) {
      return
    }

    if (hasUnsavedChanges) {
      setPendingCardId(cardId)
      return
    }

    viewModel.selectCard(cardId)
  }

  const isExitPending = pendingCardId !== null || blocker.state === 'blocked'

  const handleExitResolved = (shouldProceed: boolean) => {
    const cardId = pendingCardId

    const blockedNavigation = blocker.state === 'blocked' ? blocker : null

    if (!shouldProceed) {
      blockedNavigation?.reset()
      setPendingCardId(null)
      return
    }

    if (cardId !== null) {
      setPendingCardId(null)
      viewModel.selectCard(cardId)
      return
    }

    blockedNavigation?.proceed()
  }

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
              typeOptions={[...deckableTypes.catalogTypeOptions]}
              colorOptions={[...COLOR_FILTER_OPTIONS]}
              sortOptions={SORT_OPTIONS}
              onSearchTextChange={viewModel.setSearchText}
              onTypeChange={viewModel.setTypeFilter}
              onColorChange={viewModel.setColorFilter}
              onSortChange={viewModel.setSort}
              includeNonDeckableTypes={deckableTypes.includeNonDeckableTypes}
              onIncludeNonDeckableTypesChange={deckableTypes.onIncludeNonDeckableTypesChange}
            />

            <CardAdminCatalogPane
              cards={catalogCards}
              selectedCardId={selectedCardId}
              isLoading={isLoading}
              isError={isError}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={hasNextPage ?? false}
              onSelectCard={handleSelectCard}
              onFetchNextPage={fetchNextPage}
              listScrollContainerRef={listScrollContainerRef}
              loadMoreSentinelRef={loadMoreSentinelRef}
            />
          </aside>

          <Panel className="themed-scrollbar m-3 h-[calc(100%-1.5rem)] min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">{t('admin.view.title')}</h1>
              <div className="flex items-center gap-3">
                <Link
                  to="/admin/decks"
                  data-testid="admin-manage-decks"
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
                >
                  {t('admin.view.manageDecks')}
                </Link>
                <Link
                  to="/admin/cards/new"
                  data-testid="admin-add-card"
                  className="inline-flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--button-primary-bg)] px-4 py-2 text-sm font-semibold text-[var(--button-primary-text)] transition-colors duration-200 hover:bg-[var(--button-primary-hover)]"
                >
                  {t('admin.view.addCard')}
                </Link>
                <Link to="/" className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline">
                  {t('admin.view.backToLogin')}
                </Link>
              </div>
            </div>
            <CardAdminDetailPane
              selectedCard={selectedCard}
              isLoading={selectedCardId !== null && selectedCardQuery.isLoading}
              onUnsavedChangesChange={setHasUnsavedChanges}
              isExitPending={isExitPending}
              onExitResolved={handleExitResolved}
            />
          </Panel>
        </div>
      </div>
    </PageShell>
  )
}
