import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import type { ICardAdminPaginationFooterProps } from '@/views/admin/types/cardAdminPaginationFooter'

export function CardAdminPaginationFooter({
  sentinelRef,
  isFetchingNextPage,
  hasNextPage,
  hasCards,
  onFetchNextPage,
}: ICardAdminPaginationFooterProps) {
  const { t } = useTranslation()

  return (
    <div className="px-3 pb-4">
      <div ref={sentinelRef} className="h-2 w-full" aria-hidden="true" />

      {isFetchingNextPage ? (
        <p className="mt-2 text-center text-xs text-[var(--text-secondary)]">{t('admin.catalog.loadingMore')}</p>
      ) : null}

      {!isFetchingNextPage && hasNextPage ? (
        <div className="mt-2 flex justify-center">
          <AppButton variant="ghost" onClick={() => void onFetchNextPage()}>
            {t('admin.catalog.loadMore')}
          </AppButton>
        </div>
      ) : null}

      {!isFetchingNextPage && !hasNextPage && hasCards ? (
        <p className="mt-2 text-center text-xs text-[var(--text-secondary)]">{t('admin.catalog.endOfCatalog')}</p>
      ) : null}
    </div>
  )
}
