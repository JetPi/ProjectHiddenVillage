import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'

type IRedoWaitingBannerProps = {
  isOpen: boolean
  onCancel: () => Promise<boolean>
}

/**
 * The requester's side of a redo. It is not a blocker: the other player holds the answer, so this only says the
 * table is waiting and offers the withdrawal.
 */
function RedoWaitingBanner({ isOpen, onCancel }: IRedoWaitingBannerProps) {
  const { t } = useTranslation()
  const [isCancelling, setIsCancelling] = useState(false)

  if (!isOpen) {
    return null
  }

  const cancel = async (): Promise<void> => {
    setIsCancelling(true)
    await onCancel()
    setIsCancelling(false)
  }

  return (
    <div
      data-testid="redo-waiting-banner"
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-2 z-[400] flex max-w-[min(80vw,26rem)] -translate-x-1/2 items-center gap-2 rounded-lg border border-amber-300/50 bg-slate-950/90 px-3 py-2 text-[11px] font-semibold leading-tight text-amber-50 shadow-[0_12px_30px_rgba(0,0,0,0.55)] backdrop-blur-sm"
    >
      <span className="min-w-0 flex-1">
        <span className="block">{t('game.redo.waitingTitle')}</span>
        <span className="block font-normal text-amber-100/80">{t('game.redo.waitingBody')}</span>
      </span>
      <AppButton
        type="button"
        data-testid="redo-cancel-button"
        disabled={isCancelling}
        onClick={() => {
          void cancel()
        }}
        className="shrink-0 justify-center"
      >
        {t('game.redo.cancel')}
      </AppButton>
    </div>
  )
}

export { RedoWaitingBanner }
export type { IRedoWaitingBannerProps }
