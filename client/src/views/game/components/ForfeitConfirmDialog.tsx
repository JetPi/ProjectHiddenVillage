import { useTranslation } from 'react-i18next'
import { AppButton, Panel } from '@/components/ui'

type IForfeitConfirmDialogProps = {
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * The confirmation that stands between a misclick and a lost game. Resigning is final and the opponent wins, so it
 * is the destructive choice in the pair and Cancel takes the initial focus.
 */
function ForfeitConfirmDialog({ isSubmitting, onCancel, onConfirm }: IForfeitConfirmDialogProps) {
  const { t } = useTranslation()

  return (
    <div
      data-testid="forfeit-confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forfeit-confirm-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4"
    >
      <Panel className="w-full max-w-sm p-6 text-center">
        <p
          id="forfeit-confirm-title"
          className="text-xl font-extrabold uppercase tracking-[0.18em] text-rose-200"
        >
          {t('game.forfeit.title')}
        </p>

        <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('game.forfeit.body')}</p>

        <div className="mt-5 flex gap-2">
          <AppButton
            type="button"
            data-testid="forfeit-cancel-button"
            autoFocus
            disabled={isSubmitting}
            onClick={onCancel}
            className="flex-1 justify-center"
          >
            {t('game.forfeit.cancel')}
          </AppButton>

          <AppButton
            type="button"
            data-testid="forfeit-confirm-button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="flex-1 justify-center border-rose-400/60 bg-rose-600 text-white hover:bg-rose-500 disabled:hover:bg-rose-600"
          >
            {isSubmitting ? t('game.forfeit.resigning') : t('game.forfeit.confirm')}
          </AppButton>
        </div>
      </Panel>
    </div>
  )
}

export { ForfeitConfirmDialog }
export type { IForfeitConfirmDialogProps }
