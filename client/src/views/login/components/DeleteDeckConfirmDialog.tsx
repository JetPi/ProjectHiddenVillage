import { useTranslation } from 'react-i18next'
import { AppButton, Panel } from '@/components/ui'

type IDeleteDeckConfirmDialogProps = {
  deckName: string
  isDeleting: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * The confirmation between a misclick on the picker's X and a lost deck. Removing a deck also removes its record, so
 * the destructive choice is the confirm and Cancel takes the initial focus - the same pairing the resign dialog uses.
 */
function DeleteDeckConfirmDialog({ deckName, isDeleting, onCancel, onConfirm }: IDeleteDeckConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <div
      data-testid="delete-deck-confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-deck-confirm-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4"
    >
      <Panel className="w-full max-w-sm p-6 text-center">
        <p
          id="delete-deck-confirm-title"
          className="text-xl font-extrabold uppercase tracking-[0.18em] text-rose-200"
        >
          {t('auth.deckDelete.title')}
        </p>

        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          {t('auth.deckDelete.body', { name: deckName })}
        </p>

        <div className="mt-5 flex gap-2">
          <AppButton
            type="button"
            data-testid="delete-deck-cancel-button"
            autoFocus
            disabled={isDeleting}
            onClick={onCancel}
            className="flex-1 justify-center"
          >
            {t('auth.deckDelete.cancel')}
          </AppButton>

          <AppButton
            type="button"
            data-testid="delete-deck-confirm-button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="flex-1 justify-center border-rose-400/60 bg-rose-600 text-white hover:bg-rose-500 disabled:hover:bg-rose-600"
          >
            {isDeleting ? t('auth.deckDelete.deleting') : t('auth.deckDelete.confirm')}
          </AppButton>
        </div>
      </Panel>
    </div>
  )
}

export { DeleteDeckConfirmDialog }
export type { IDeleteDeckConfirmDialogProps }
