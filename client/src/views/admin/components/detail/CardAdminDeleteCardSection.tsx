import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { AppButton } from '@/components/ui'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { useDeleteCardCatalogEntryMutation } from '@/services/queries/cardQueries'
import { useCardAdminViewStore } from '@/state/cardAdminViewStore'
import { getCardAdminRequestErrorMessage } from '@/views/admin/model/cardAdminEffectPayload'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

const TOAST_ID = 'card-admin-delete-status'

export function CardAdminDeleteCardSection({ card }: { card: ICardCatalogItemResponse }) {
  const { t } = useTranslation()
  const deleteMutation = useDeleteCardCatalogEntryMutation()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [confirmationText, setConfirmationText] = useState('')
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const requiredWord = t('admin.delete.confirmWord')
  const isConfirmed = confirmationText.trim().toLowerCase() === requiredWord.trim().toLowerCase()
  const isRemovingFromDecks = blockedMessage !== null

  const closeDialog = () => {
    setIsDialogOpen(false)
    setConfirmationText('')
    setBlockedMessage(null)
    setErrorMessage(null)
  }

  const handleConfirm = async () => {
    setErrorMessage(null)

    try {
      const impact = await deleteMutation.mutateAsync({
        cardId: card.id,
        force: isRemovingFromDecks,
      })

      showAppSuccessToast(
        impact.deckCount > 0
          ? t('admin.delete.deletedFromDecks', { count: impact.deckCount })
          : t('admin.delete.deleted'),
        { id: TOAST_ID, position: 'top-right' },
      )

      useCardAdminViewStore.getState().clearSelection()
      closeDialog()
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setBlockedMessage(getCardAdminRequestErrorMessage(error))
        return
      }

      const message = getCardAdminRequestErrorMessage(error)
      setErrorMessage(message)
      showAppInfoToast(message ?? t('admin.delete.failed'), { id: TOAST_ID, position: 'top-right' })
    }
  }

  return (
    <section className="mt-6 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('admin.delete.button')}</h3>
          <p className="text-[11px] text-[var(--text-muted)]">{t('admin.delete.description')}</p>
        </div>

        <AppButton
          type="button"
          variant="ghost"
          onClick={() => setIsDialogOpen(true)}
          className="border-red-500/40 text-red-600 hover:bg-red-500/10"
          data-testid="admin-delete-card"
        >
          {t('admin.delete.button')}
        </AppButton>
      </div>

      {isDialogOpen && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !deleteMutation.isPending) {
                closeDialog()
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="card-admin-delete-title"
              className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
            >
              <h2
                id="card-admin-delete-title"
                className="text-lg font-bold text-[var(--text-primary)]"
              >
                {t('admin.delete.dialogTitle')}
              </h2>

              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {t('admin.delete.dialogBody', { name: card.displayName, id: card.id })}
              </p>

              <label
                className="mt-3 block text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]"
                htmlFor="card-admin-delete-confirm"
              >
                {t('admin.delete.confirmLabel', { word: requiredWord })}
              </label>
              <input
                id="card-admin-delete-confirm"
                value={confirmationText}
                placeholder={requiredWord}
                autoFocus
                onChange={(event) => setConfirmationText(event.target.value)}
                disabled={deleteMutation.isPending}
                className="mt-1 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
              />

              {blockedMessage ? (
                <p className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                  {blockedMessage}
                </p>
              ) : null}

              {errorMessage ? (
                <p className="mt-3 rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2 text-xs text-red-700">
                  {errorMessage}
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <AppButton
                  type="button"
                  variant="ghost"
                  onClick={closeDialog}
                  disabled={deleteMutation.isPending}
                >
                  {t('admin.delete.cancel')}
                </AppButton>

                <AppButton
                  type="button"
                  onClick={() => {
                    void handleConfirm()
                  }}
                  disabled={!isConfirmed || deleteMutation.isPending}
                >
                  {deleteMutation.isPending
                    ? t('admin.delete.submitting')
                    : isRemovingFromDecks
                      ? t('admin.delete.forceSubmit')
                      : t('admin.delete.submit')}
                </AppButton>
              </div>
            </div>
          </div>,
          document.body,
        )
        : null}
    </section>
  )
}
