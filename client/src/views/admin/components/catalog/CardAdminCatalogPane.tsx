import { useTranslation } from 'react-i18next'
import { CardAdminCardGrid } from './CardAdminCardGrid'
import { CardAdminPaginationFooter } from './CardAdminPaginationFooter'
import type { ICardAdminCatalogPaneProps } from '@/views/admin/types/cardAdminCatalogPane'

function renderStateMessage(message: string) {
  return <div className="bg-[var(--surface-muted)] px-4 py-6 text-sm text-[var(--text-secondary)]">{message}</div>
}

export function CardAdminCatalogPane({
  cards,
  selectedCardId,
  isLoading,
  isError,
  isFetchingNextPage,
  hasNextPage,
  onSelectCard,
  onFetchNextPage,
  listScrollContainerRef,
  loadMoreSentinelRef,
}: ICardAdminCatalogPaneProps) {
  const { t } = useTranslation()

  return (
    <div
      ref={listScrollContainerRef}
      className="themed-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)]"
    >
      {isLoading ? renderStateMessage(t('admin.catalog.loadingCards')) : null}

      {isError ? renderStateMessage(t('admin.catalog.loadFailed')) : null}

      {!isLoading && !isError ? (
        cards.length === 0 ? (
          renderStateMessage(t('admin.catalog.noMatches'))
        ) : (
          <CardAdminCardGrid cards={cards} selectedCardId={selectedCardId} onSelectCard={onSelectCard} />
        )
      ) : null}

      {!isLoading && !isError ? (
        <CardAdminPaginationFooter
          sentinelRef={loadMoreSentinelRef}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          hasCards={cards.length > 0}
          onFetchNextPage={onFetchNextPage}
        />
      ) : null}
    </div>
  )
}
