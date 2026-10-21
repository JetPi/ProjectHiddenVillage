import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import type { IDeckAdminDeleteDialogProps } from './types'

/**
 * Deleting a deck is irreversible, so it is asked for explicitly. The server refuses to delete a deck a game
 * instance still points at (409) and the screen reports that answer instead of pretending the delete worked.
 */
export function DeckAdminDeleteDialog({
  isOpen,
  deckName,
  isDeleting,
  onCancel,
  onConfirm,
}: IDeckAdminDeleteDialogProps) {
  const { t } = useTranslation()

  if (!isOpen || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !isDeleting) {
          onCancel()
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isDeleting) {
          onCancel()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-admin-delete-title"
        data-testid="admin-deck-delete-dialog"
        className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] p-4"
      >
        <h2 id="deck-admin-delete-title" className="text-lg font-bold text-[var(--text-primary)]">
          {t('admin.decks.delete.title')}
        </h2>

        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {t('admin.decks.delete.body', { name: deckName })}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <AppButton type="button" variant="ghost" onClick={onCancel} disabled={isDeleting} autoFocus>
            {t('admin.decks.delete.cancel')}
          </AppButton>

          <AppButton
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            data-testid="admin-deck-delete-confirm"
            className="border-red-500/40 bg-red-600 text-white hover:bg-red-700"
          >
            {isDeleting ? t('admin.decks.delete.deleting') : t('admin.decks.delete.confirm')}
          </AppButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
