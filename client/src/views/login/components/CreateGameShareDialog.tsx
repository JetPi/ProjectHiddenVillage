import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppButton, Panel } from '@/components/ui'
import { FormInput } from '@/components/forms'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { hasSecondPlayer, useGameOpponentJoinedQuery } from '@/services/queries/gameStateQueries'
import { copyTextToClipboard } from '@/views/utils/clipboard'
import { buildGameInviteLink } from '@/views/login/utils/gameInviteLink'

export type ICreateGameShareDialogProps = {
  gameId: string
  rulesetName: string
  onEnterGame: () => void
  /** Leaves the created game behind - only offered when the wait can no longer be trusted. */
  onLeave: () => void
}

type TCopyTarget = 'code' | 'link'

/**
 * The creator's only chance to hand out the code before sitting down: the game already exists and is joinable, so
 * the code and the link are real. The dialog is the last step of create mode - `Enter Game` is what actually
 * navigates - which is why it never dismisses itself.
 *
 * It also watches the table: the moment a second player sits down the creator is handed over, so inviting somebody
 * does not leave them parked on this screen while the game starts without them.
 */
export function CreateGameShareDialog({
  gameId,
  rulesetName,
  onEnterGame,
  onLeave,
}: ICreateGameShareDialogProps) {
  const { t } = useTranslation()
  const [copiedTarget, setCopiedTarget] = useState<TCopyTarget | null>(null)
  const hasEnteredRef = useRef(false)
  const inviteLink = buildGameInviteLink(gameId)

  const opponentJoinedQuery = useGameOpponentJoinedQuery(gameId)
  const hasOpponent = hasSecondPlayer(opponentJoinedQuery.data)
  // The retries are already spent by the time the query settles into an error, so this means "the check itself is
  // broken" (the game is gone, or we are no longer a player of it) rather than a one-off hiccup.
  const isWatchingGame = !opponentJoinedQuery.isError

  useEffect(() => {
    if (!hasOpponent || hasEnteredRef.current) {
      return
    }

    // The poll can report the same second player on the next tick as well, and the creator must only be moved once.
    hasEnteredRef.current = true
    onEnterGame()
  }, [hasOpponent, onEnterGame])

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-game-share-title"
    >
      <Panel className="w-full max-w-md p-5 text-center">
        <h2
          id="create-game-share-title"
          className="text-lg font-semibold text-[var(--text-primary)]"
        >
          {t('auth.createGame.title', { ruleset: rulesetName })}
        </h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {t('auth.createGame.body')}
        </p>

        <p
          data-testid="create-game-code"
          className="mt-3 text-3xl font-semibold tracking-[0.35em] text-[var(--text-primary)]"
        >
          {gameId}
        </p>

        <label
          htmlFor="create-game-invite-link"
          className="mt-4 block text-[11px] font-normal uppercase leading-none tracking-[0.08em] text-[var(--text-muted)]"
        >
          {t('auth.createGame.linkLabel')}
        </label>
        <FormInput
          id="create-game-invite-link"
          data-testid="create-game-link"
          value={inviteLink}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          className="mt-1 py-1.5 text-xs"
        />

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
            data-testid="create-game-copy-link"
          >
            {copiedTarget === 'link'
              ? t('auth.createGame.copyLinkDone')
              : t('auth.createGame.copyLink')}
          </AppButton>
          <AppButton
            type="button"
            onClick={onEnterGame}
            data-testid="create-game-enter"
          >
            {t('auth.createGame.enter')}
          </AppButton>
          {!isWatchingGame ? (
            <AppButton
              type="button"
              variant="ghost"
              onClick={onLeave}
              data-testid="create-game-back"
            >
              {t('auth.createGame.back')}
            </AppButton>
          ) : null}
        </div>
      </Panel>
    </div>
  )
}
