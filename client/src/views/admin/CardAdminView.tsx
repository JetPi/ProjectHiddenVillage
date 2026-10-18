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
import { COLOR_FILTER_OPTIONS, SORT_OPTIONS, TYPE_FILTER_OPTIONS } from '@/views/admin/constants'
import type { ICardCatalogListItemResponse } from '@/types/cardCatalog'

/** How long the search box waits before it becomes a request; one keystroke is not one query. */
const SEARCH_DEBOUNCE_MS = 250

export function CardAdminView() {
  const { t } = useTranslation()
  const viewModel = useCardAdminViewModel()

  const [debouncedSearch, setDebouncedSearch] = useState(viewModel.searchText)

  useEffect(() => {
    const timeoutHandle = window.setTimeout(() => {
      setDebouncedSearch(viewModel.searchText)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutHandle)
  }, [viewModel.searchText])

  // The filters and the search are the server's job now: they go into the query, and therefore into the cache
  // key, so the rail never filters a subset of what it happened to have loaded.
  const catalogParams = useMemo(
    () => ({
      pageSize: viewModel.pageSize,
      sort: viewModel.sort,
      search: debouncedSearch,
      types: viewModel.type,
      colors: viewModel.color,
    }),
    [viewModel.pageSize, viewModel.sort, debouncedSearch, viewModel.type, viewModel.color],
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
    // A page can repeat a row when the catalogue shifts under the scroll; one entry per id, in one pass.
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

  // The listing is lean on purpose, so the editor's card - effects and all - is fetched by id. That also means a
  // selected card does not have to be sitting on a loaded page for the pane to show it.
  const selectedCardQuery = useCardCatalogByIdsQuery(selectedCardIds)
  const selectedCard = selectedCardQuery.data?.[0] ?? null

  /**
   * The pane reports its own draft, so this screen knows whether leaving would throw work away. It is what the
   * dialogs below and the router blocker are driven by - nothing else decides that here.
   */
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

  // Leaving the route is the same loss as switching cards, so the router asks first and the dialog decides.
  const blocker = useBlocker(hasUnsavedChanges)

  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        // A reload or a closed tab is outside the router's reach; preventing it is what makes the browser show
        // its own generic prompt.
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
      // Held rather than navigated: the dialog decides whether the draft is thrown away.
      setPendingCardId(cardId)
      return
    }

    viewModel.selectCard(cardId)
  }

  /**
   * Either an exit is held here (another card was clicked) or the router is holding one of its own. The dialog
   * lives in the detail pane because saving is one of its answers, and only the pane can save.
   */
  const isExitPending = pendingCardId !== null || blocker.state === 'blocked'

  const handleExitResolved = (shouldProceed: boolean) => {
    const cardId = pendingCardId

    // The router only exposes these while it is the thing holding the navigation.
    const blockedNavigation = blocker.state === 'blocked' ? blocker : null

    if (!shouldProceed) {
      // Staying has to release the router too, otherwise the next navigation would still be held.
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
              typeOptions={[...TYPE_FILTER_OPTIONS]}
              colorOptions={[...COLOR_FILTER_OPTIONS]}
              sortOptions={SORT_OPTIONS}
              onSearchTextChange={viewModel.setSearchText}
              onTypeChange={viewModel.setTypeFilter}
              onColorChange={viewModel.setColorFilter}
              onSortChange={viewModel.setSort}
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
                {/* A navigation, so it stays a link and keeps middle-click and open-in-new-tab working. */}
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
