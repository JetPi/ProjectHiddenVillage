import { useTranslation } from 'react-i18next'
import { AppButton, Panel } from '@/components/ui'

type ICloseTableConfirmDialogProps = {
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * The confirmation that stands between a misclick and a dead invite. Nobody has joined, so there is no game to lose,
 * but the code may already be in a friend's clipboard and closing the table ends it - so Cancel takes the initial
 * focus, exactly like the forfeit dialog it sits next to.
 */
function CloseTableConfirmDialog({ isSubmitting, onCancel, onConfirm }: ICloseTableConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <div
      data-testid="close-table-confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-table-confirm-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4"
    >
      <Panel className="w-full max-w-sm p-6 text-center">
        <p
          id="close-table-confirm-title"
          className="text-xl font-extrabold uppercase tracking-[0.18em] text-amber-200"
        >
          {t('game.closeTable.title')}
        </p>

        <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('game.closeTable.body')}</p>

        <div className="mt-5 flex gap-2">
          <AppButton
            type="button"
            data-testid="close-table-cancel-button"
            autoFocus
            disabled={isSubmitting}
            onClick={onCancel}
            className="flex-1 justify-center"
          >
            {t('game.closeTable.cancel')}
          </AppButton>

          <AppButton
            type="button"
            data-testid="close-table-confirm-button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="flex-1 justify-center border-amber-400/60 bg-amber-600 text-white hover:bg-amber-500 disabled:hover:bg-amber-600"
          >
            {isSubmitting ? t('game.closeTable.cancelling') : t('game.closeTable.confirm')}
          </AppButton>
        </div>
      </Panel>
    </div>
  )
}

export { CloseTableConfirmDialog }
export type { ICloseTableConfirmDialogProps }
