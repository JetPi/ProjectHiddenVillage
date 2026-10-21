import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { useInfiniteCardCatalogQuery } from '@/services/queries/cardQueries'
import { useDeckAdminViewStore } from '@/state/deckAdminViewStore'
import {
  CardAdminCatalogPane,
  CardAdminFilterPanel,
  DeckAdminDeleteDialog,
  DeckAdminEditorPane,
  DeckAdminImportDialog,
  DeckAdminListRail,
} from '@/views/admin/components'
import { useDeckAdminModel } from '@/views/admin/model/useDeckAdminModel'
import { COLOR_FILTER_OPTIONS, SORT_OPTIONS, TYPE_FILTER_OPTIONS } from '@/views/admin/constants'
import {
  isNonDeckableCardTypeFilter,
  resolveDeckCatalogTypeFilter,
} from '@/views/admin/utils/deckCatalogTypeFilters'
import { MAX_NON_LEADER_COPIES } from '@/views/admin/utils/deckDraftValidation'
import { getApiErrorMessage } from '@/views/utils/getApiErrorMessage'
import type { IDeckCardInput } from '@/types/deck'
import type { ICardCatalogListItemResponse } from '@/types/cardCatalog'

/** How long the search box waits before it becomes a request; one keystroke is not one query. */
const SEARCH_DEBOUNCE_MS = 250
const TOAST_ID = 'deck-admin-status'

/**
 * The public deck builder. Three columns: the decks rail, the same catalogue browser the card editor uses (in
 * quantity mode), and the drafted deck. The catalogue and the rating of the deck are deliberately separate - a
 * card click edits the draft, and saving is what the rules judge.
 */
export function DeckAdminView() {
  const { deckId: deckIdParam } = useParams<{ deckId: string }>()
  const deckId = deckIdParam ?? null

  // A draft belongs to one deck. Keying the screen remounts it when the route moves to another deck (or to the
  // create screen), which is what makes the draft reset - no effect has to clear state afterwards.
  return <DeckAdminScreen key={deckId ?? 'new'} deckId={deckId} />
}

function DeckAdminScreen({ deckId }: { deckId: string | null }) {
  const { t } = useTranslation()

  const filters = useDeckAdminViewStore(
    useShallow((state) => ({
      searchText: state.searchText,
      type: state.type,
      color: state.color,
      sort: state.sort,
      includeNonDeckableTypes: state.includeNonDeckableTypes,
      setSearchText: state.setSearchText,
      setTypeFilter: state.setTypeFilter,
      setColorFilter: state.setColorFilter,
      setSort: state.setSort,
      setIncludeNonDeckableTypes: state.setIncludeNonDeckableTypes,
    })),
  )

  const [debouncedSearch, setDebouncedSearch] = useState(filters.searchText)

  useEffect(() => {
    const timeoutHandle = window.setTimeout(() => {
      setDebouncedSearch(filters.searchText)
    }, SEARCH_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutHandle)
  }, [filters.searchText])

  const catalogParams = useMemo(
    () => ({
      pageSize: 25,
      sort: filters.sort,
      search: debouncedSearch,
      // Chakra and Summon are off the list unless the toggle below is on: a deck cannot contain them, so the
      // builder should not offer them by default.
      types: resolveDeckCatalogTypeFilter(filters.type, filters.includeNonDeckableTypes),
      colors: filters.color,
    }),
    [filters.sort, debouncedSearch, filters.type, filters.color, filters.includeNonDeckableTypes],
  )

  // The type chips follow the toggle: offering a type that the query is filtering out would be a dead control.
  const catalogTypeOptions = useMemo(
    () =>
      TYPE_FILTER_OPTIONS.filter(
        (option) => filters.includeNonDeckableTypes || !isNonDeckableCardTypeFilter(option.value),
      ),
    [filters.includeNonDeckableTypes],
  )

  const catalogPageQuery = useInfiniteCardCatalogQuery(catalogParams, { enabled: true })

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

  const model = useDeckAdminModel({ deckId, catalogCards })

  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null)
  const listScrollContainerRef = useRef<HTMLDivElement | null>(null)
  const { fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = catalogPageQuery

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

  const selectedCountByCardId = useMemo(
    () => new Map(model.draft.quantitiesByCardId),
    [model.draft.quantitiesByCardId],
  )

  const handleSave = async () => {
    const isNewDeck = deckId === null

    try {
      const savedDeck = await model.save()

      showAppSuccessToast(
        isNewDeck
          ? t('admin.decks.toasts.created', { name: savedDeck.name })
          : t('admin.decks.toasts.updated', { name: savedDeck.name }),
        { id: TOAST_ID, position: 'top-right' },
      )
    } catch (error) {
      showAppInfoToast(getApiErrorMessage(error, t('admin.decks.toasts.saveFailed')), {
        id: TOAST_ID,
        position: 'top-right',
      })
    }
  }

  const handleDelete = async () => {
    try {
      await model.remove()
      setIsDeleteOpen(false)
      showAppSuccessToast(t('admin.decks.toasts.deleted'), { id: TOAST_ID, position: 'top-right' })
    } catch (error) {
      // A deck a game still points at answers 409 with the reason; say it rather than closing the dialog silently.
      showAppInfoToast(getApiErrorMessage(error, t('admin.decks.toasts.deleteFailed')), {
        id: TOAST_ID,
        position: 'top-right',
      })
    }
  }

  const handleImport = (cards: IDeckCardInput[]) => {
    model.importCards(cards)
    showAppSuccessToast(t('admin.decks.toasts.imported', { count: cards.length }), {
      id: TOAST_ID,
      position: 'top-right',
    })
  }

  return (
    <PageShell compact fullBleed edgeToEdge className="h-dvh overflow-hidden">
      <div className="h-full w-full">
        <div className="grid h-full min-h-0 gap-0 [grid-template-columns:minmax(15rem,19rem)_minmax(22rem,34rem)_minmax(24rem,1fr)] max-[76rem]:[grid-template-columns:15rem_minmax(0,1fr)] max-[76rem]:[grid-template-areas:'rail_catalog'_'rail_editor']">
          <DeckAdminListRail
            decks={model.decks}
            selectedDeckId={deckId}
            isLoading={model.isDecksLoading}
            isError={model.isDecksError}
          />

          <section className="flex h-full min-h-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {t('admin.decks.catalog.title')}
              </h2>
              <Link to="/admin/cards" className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline">
                {t('admin.decks.catalog.cardAdmin')}
              </Link>
            </div>

            <CardAdminFilterPanel
              searchText={filters.searchText}
              typeValues={filters.type}
              colorValues={filters.color}
              sortValue={filters.sort}
              typeOptions={[...catalogTypeOptions]}
              colorOptions={[...COLOR_FILTER_OPTIONS]}
              sortOptions={SORT_OPTIONS}
              onSearchTextChange={filters.setSearchText}
              onTypeChange={filters.setTypeFilter}
              onColorChange={filters.setColorFilter}
              onSortChange={filters.setSort}
              includeNonDeckableTypes={filters.includeNonDeckableTypes}
              onIncludeNonDeckableTypesChange={(nextValue) => {
                filters.setIncludeNonDeckableTypes(nextValue)

                // Turning them off drops any Chakra/Summon chip that is still selected, otherwise the query
                // would ask only for types the chips no longer show.
                if (!nextValue) {
                  filters.setTypeFilter(filters.type.filter((type) => !isNonDeckableCardTypeFilter(type)))
                }
              }}
            />

            <CardAdminCatalogPane
              cards={catalogCards}
              selectedCardId={null}
              isLoading={isLoading}
              isError={isError}
              isFetchingNextPage={isFetchingNextPage}
              hasNextPage={hasNextPage ?? false}
              onSelectCard={() => {}}
              onFetchNextPage={fetchNextPage}
              listScrollContainerRef={listScrollContainerRef}
              loadMoreSentinelRef={loadMoreSentinelRef}
              selectedCountByCardId={selectedCountByCardId}
              maxCopies={MAX_NON_LEADER_COPIES}
              onAddCard={model.addCopy}
              onRemoveCard={model.removeCopy}
            />
          </section>

          <Panel className="themed-scrollbar m-3 h-[calc(100%-1.5rem)] min-h-0 overflow-hidden p-3">
            <DeckAdminEditorPane
              isNew={deckId === null}
              name={model.name}
              onNameChange={model.setName}
              leaderCard={model.leaderCard}
              selectedCards={model.selectedCards}
              totalCopies={model.totalCopies}
              validation={model.validation}
              canSave={model.canSave}
              isDirty={model.isDirty}
              isSaving={model.isSaving}
              isLoading={model.isDeckLoading}
              isError={model.isDeckError}
              onAddCopy={model.addCopy}
              onRemoveCopy={model.removeCopy}
              onClearCard={model.clearCard}
              onClearLeader={() => {
                if (model.leaderCard) {
                  model.clearCard(model.leaderCard.cardId)
                }
              }}
              onSave={() => {
                void handleSave()
              }}
              onOpenImport={() => setIsImportOpen(true)}
              onOpenDelete={() => setIsDeleteOpen(true)}
            />
          </Panel>
        </div>
      </div>

      {isImportOpen ? (
        <DeckAdminImportDialog
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          onImport={handleImport}
        />
      ) : null}

      {isDeleteOpen ? (
        <DeckAdminDeleteDialog
          isOpen={isDeleteOpen}
          deckName={model.name.trim() || t('admin.decks.rail.unnamed')}
          isDeleting={model.isDeleting}
          onCancel={() => setIsDeleteOpen(false)}
          onConfirm={() => {
            void handleDelete()
          }}
        />
      ) : null}
    </PageShell>
  )
}
