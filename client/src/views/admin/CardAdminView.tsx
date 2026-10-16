import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBeforeUnload, useBlocker } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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

  /**
   * The pane reports its own draft, so this screen knows whether leaving would throw work away. It is what the
   * dialogs below and the router blocker are driven by - nothing else decides that here.
   */
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [pendingCardId, setPendingCardId] = useState<string | null>(null)

  // A filter that hides the card being edited must not take its draft with it - searching for something else is
  // not a decision to discard anything - so while the draft is dirty the card is resolved from everything that is
  // loaded rather than from what the filters left on screen. The clear-selection effect below is held back for the
  // same reason.
  const selectedCard = useMemo(() => {
    const visibleCard = filteredCards.find((card) => card.id === viewModel.selectedCardId)

    if (visibleCard || !hasUnsavedChanges) {
      return visibleCard ?? null
    }

    return allLoadedItems.find((card) => card.id === viewModel.selectedCardId) ?? null
  }, [filteredCards, allLoadedItems, viewModel.selectedCardId, hasUnsavedChanges])

  useEffect(() => {
    if (!viewModel.selectedCardId) {
      return
    }

    const hasSelectedCard = filteredCards.some((card) => card.id === viewModel.selectedCardId)
    if (!hasSelectedCard && !hasUnsavedChanges) {
      viewModel.clearSelection()
    }
  }, [filteredCards, viewModel, hasUnsavedChanges])

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
    if (cardId === viewModel.selectedCardId) {
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
