import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { AppButton, Panel } from '@/components/ui'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { cancelUnstartedGame } from '@/services/api/gameApi'
import {
  gameStateQueryKeys,
  hasSecondPlayer,
  useGameOpponentJoinedQuery,
} from '@/services/queries/gameStateQueries'
import { isApiConflictError } from '@/views/utils/getApiErrorMessage'
import { copyTextToClipboard } from '@/views/utils/clipboard'
import { buildGameInviteLink } from '@/views/login/utils/gameInviteLink'

export type ICreateGameShareDialogProps = {
  gameId: string
  rulesetName: string
  /** The host-only rules this table was opened with, already worded - empty for a plain table. */
  modifierLabels?: string[]
  onEnterGame: () => void
  /** The creator backed out: the table is gone, or on its way out, so return to the hosting form. */
  onCancel: () => void
}

type TCopyTarget = 'code' | 'link'

/**
 * The creator's only chance to hand out the code before sitting down: the game already exists and is joinable, so
 * the code and the link are real. The dialog is the last step of create mode - `Enter Game` is what actually
 * navigates - which is why it never dismisses itself on a stray click.
 *
 * It also watches the table: the moment a second player sits down the creator is handed over, so inviting somebody
 * does not leave them parked on this screen while the game starts without them.
 *
 * Backing out is an undo, not just a dismissal. The table was minted for this dialog, so cancelling retires it and
 * gives its code back; if an opponent took the seat while the creator was deciding, the server refuses and the
 * creator is handed over instead of losing a game that now has somebody in it.
 */
export function CreateGameShareDialog({
  gameId,
  rulesetName,
  modifierLabels = [],
  onEnterGame,
  onCancel,
}: ICreateGameShareDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [copiedTarget, setCopiedTarget] = useState<TCopyTarget | null>(null)
  const [isCancelling, setIsCancelling] = useState(false)
  const hasEnteredRef = useRef(false)
  const inviteLink = buildGameInviteLink(gameId)

  const opponentJoinedQuery = useGameOpponentJoinedQuery(gameId)
  const hasOpponent = hasSecondPlayer(opponentJoinedQuery.data)
  // The retries are already spent by the time the query settles into an error, so this means "the check itself is
  // broken" (the game is gone, or we are no longer a player of it) rather than a one-off hiccup.
  const isWatchingGame = !opponentJoinedQuery.isError

  useEffect(() => {
    // A seat that appears while the creator is closing the table is the server's answer to report (409), not a
    // reason to navigate out from under the request: doing both would hide the table that just became real.
    if (!hasOpponent || hasEnteredRef.current || isCancelling) {
      return
    }

    // The poll can report the same second player on the next tick as well, and the creator must only be moved once.
    hasEnteredRef.current = true
    onEnterGame()
  }, [hasOpponent, isCancelling, onEnterGame])

  const forgetCachedTable = () => {
    // The table is gone, so nothing may keep answering for its code. Deferred until after the dialog has left the
    // tree: removing an entry the poll is still observing would only have the poll recreate it.
    window.setTimeout(() => {
      queryClient.removeQueries({ queryKey: gameStateQueryKeys.byCode(gameId) })
    }, 0)
  }

  const handleCopy = async (target: TCopyTarget) => {
    const value = target === 'link' ? inviteLink : gameId
    const wasCopied = await copyTextToClipboard(value)

    if (!wasCopied) {
      showAppInfoToast(t('auth.createGame.copyFailed'))
      return
    }

    setCopiedTarget(target)
    showAppSuccessToast(
      target === 'link' ? t('auth.createGame.copyLinkDone') : t('auth.createGame.copyCodeDone'),
      { id: 'create-game-copy-status' },
    )
  }

  const handleCancel = async () => {
    if (isCancelling) {
      return
    }

    setIsCancelling(true)

    try {
      await cancelUnstartedGame(gameId)
      showAppSuccessToast(t('auth.createGame.tableClosed'))
      onCancel()
      forgetCachedTable()
    } catch (error) {
      if (isApiConflictError(error)) {
        // Somebody sat down first: the table is a game now, so the creator is handed over to it rather than kept
        // out of it. The poll is also running, and this is the same hand-off it would have made.
        showAppInfoToast(t('auth.createGame.seatTaken'))
        hasEnteredRef.current = true
        onEnterGame()
        return
      }

      // The host asked to leave and has to be able to: the table is at worst left to the retirement sweep, which is
      // exactly what would have happened had the dialog never existed. The 404 case never reaches here - the API
      // call resolves it as "already undone".
      showAppInfoToast(t('auth.createGame.cancelFailed'))
      onCancel()
      forgetCachedTable()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-game-share-title"
    >
      <Panel className="relative w-full max-w-md p-5 text-center">
        {/* Backing out is a corner action, not one of the three things the dialog exists to offer: it stays small and
            out of the row, so it cannot be mistaken for the way forward. */}
        <AppButton
          type="button"
          variant="ghost"
          onClick={() => void handleCancel()}
          disabled={isCancelling}
          data-testid="create-game-back"
          aria-label={
            isCancelling
              ? t('auth.createGame.cancelling')
              : t('auth.createGame.cancelTable')
          }
          title={t('auth.createGame.cancelTable')}
          className="absolute right-1.5 top-1.5 h-7 w-7 min-w-0 rounded-md px-0 py-0 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          {isCancelling ? <span className="text-[10px] leading-none">…</span> : <X size={16} />}
        </AppButton>
        <h2
          id="create-game-share-title"
          className="px-6 text-lg font-semibold text-[var(--text-primary)]"
        >
          {t('auth.createGame.title', { ruleset: rulesetName })}
        </h2>
        {modifierLabels.length > 0 ? (
          <p
            data-testid="create-game-modifiers"
            className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]"
          >
            {modifierLabels.join(' · ')}
          </p>
        ) : null}
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {t('auth.createGame.body')}
        </p>

        <p
          data-testid="create-game-code"
          className="mt-3 text-3xl font-semibold tracking-[0.35em] text-[var(--text-primary)]"
        >
          {gameId}
        </p>

        <p
          data-testid="create-game-waiting"
          className={`mt-3 text-xs ${
            isWatchingGame ? 'text-[var(--text-muted)]' : 'text-[var(--button-primary-bg)]'
          }`}
        >
          {!isWatchingGame
            ? t('auth.createGame.watchFailed')
            : hasOpponent
              ? t('auth.createGame.opponentJoined')
              : t('auth.createGame.waitingForOpponent')}
        </p>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <AppButton
            type="button"
            variant="ghost"
            onClick={() => void handleCopy('code')}
            disabled={isCancelling}
            data-testid="create-game-copy-code"
          >
            {copiedTarget === 'code'
              ? t('auth.createGame.copyCodeDone')
              : t('auth.createGame.copyCode')}
          </AppButton>
          <AppButton
            type="button"
            variant="ghost"
            onClick={() => void handleCopy('link')}
            disabled={isCancelling}
            data-testid="create-game-copy-link"
          >
            {copiedTarget === 'link'
              ? t('auth.createGame.copyLinkDone')
              : t('auth.createGame.copyLink')}
          </AppButton>
          <AppButton
            type="button"
            onClick={onEnterGame}
            disabled={isCancelling}
            data-testid="create-game-enter"
          >
            {t('auth.createGame.enter')}
          </AppButton>
         
        </div>
      </Panel>
    </div>
  )
}
