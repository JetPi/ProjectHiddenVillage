import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppButton, Panel } from '@/components/ui'

type IRedoConsentDialogProps = {
  isOpen: boolean
  onRespond: (accepted: boolean) => Promise<boolean>
}

/**
 * The opponent's side of a redo: the table is frozen until this is answered, and agreeing moves the board back one
 * move, so keeping the board is the initial focus.
 */
function RedoConsentDialog({ isOpen, onRespond }: IRedoConsentDialogProps) {
  const { t } = useTranslation()
  const [isAnswering, setIsAnswering] = useState(false)

  if (!isOpen) {
    return null
  }

  const respond = async (accepted: boolean): Promise<void> => {
    setIsAnswering(true)
    await onRespond(accepted)
    setIsAnswering(false)
  }

  return (
    // Above the board's own overlays (the modifier badge and the sidebar tooltips reach z-[300]) and anchored to the
    // upper half, so the turn banner and the phase row cannot cover the question.
    <div
      data-testid="redo-consent-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="redo-consent-title"
      className="fixed inset-0 z-[400] flex items-start justify-center bg-black/70 px-4 pt-[18vh]"
    >
      <Panel className="w-full max-w-sm p-6 text-center">
        <p
          id="redo-consent-title"
          className="text-lg font-semibold text-[var(--text-primary)]"
        >
          {t('game.redo.requestTitle')}
        </p>

        <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('game.redo.requestBody')}</p>

        <div className="mt-5 flex gap-2">
          <AppButton
            type="button"
            data-testid="redo-decline-button"
            autoFocus
            disabled={isAnswering}
            onClick={() => {
              void respond(false)
            }}
            className="flex-1 justify-center"
          >
            {t('game.redo.decline')}
          </AppButton>

          <AppButton
            type="button"
            data-testid="redo-accept-button"
            disabled={isAnswering}
            onClick={() => {
              void respond(true)
            }}
            className="flex-1 justify-center border-amber-300/60 bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:hover:bg-amber-500"
          >
            {isAnswering ? t('game.redo.answering') : t('game.redo.accept')}
          </AppButton>
        </div>
      </Panel>
    </div>
  )
}

export { RedoConsentDialog }
export type { IRedoConsentDialogProps }
