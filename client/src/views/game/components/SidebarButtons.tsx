import { useState } from "react";
import { Flag, Lightbulb, MessageSquare, RotateCcw, ScrollText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { IGameZonesProps } from "@/views/game/types";
import { AppButton } from "@/components/ui";
import { useGameChatStore } from "@/state/gameChatStore";
import { useGameUIStore } from "@/state/gameUIStore";
import { useHasRoomForChatColumn } from "@/views/game/hooks";
import { ForfeitConfirmDialog } from './ForfeitConfirmDialog'

// Tooltips are rendered outside the sidebar's own column, straight over the board, so they need both an opaque
// fill (a token that actually resolves - `--surface-elevated` is not defined anywhere, which left these labels
// see-through) and a z-index above every board layer they can cover: attack links sit at z-[240] and a dragged
// hand card at z-[260].
const SIDEBAR_TOOLTIP_CLASS_NAME =
  'pointer-events-none absolute right-full top-1/2 z-[300] mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--popup-bg)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-md group-hover:block'

export function SideBarButtons(props: IGameZonesProps){
    const { t } = useTranslation()
    const isBattleActionTargeting = useGameUIStore((state) => state.pendingCardTargeting !== null)
    const isEffectTargeting = useGameUIStore((state) => state.pendingEffectTargeting !== null)
    const isActionLogOpen = useGameUIStore((state) => state.isActionLogOpen)
    const toggleActionLog = useGameUIStore((state) => state.toggleActionLog)
    const isGameChatOpen = useGameUIStore((state) => state.isGameChatOpen)
    const toggleGameChat = useGameUIStore((state) => state.toggleGameChat)
    const unreadChatCount = useGameChatStore((state) => state.unreadCount)
    // With room for the docked panel the chat is always on screen, so there is nothing to toggle.
    const hasRoomForChat = useHasRoomForChatColumn()
    const [isForfeitDialogOpen, setIsForfeitDialogOpen] = useState(false)
    const [isForfeiting, setIsForfeiting] = useState(false)

    const frozenClassName = props.isPresentationPending ? ' pointer-events-none' : ''
   
    const rulesetName = props.gameState.ruleset?.name ?? null
    const isGameOver = Boolean(props.gameState.gameOutcome)
    const isRedoPending = Boolean(props.gameState.pendingRedo)
    // The button is only offered while asking would actually go somewhere: the engine decides when a rewind point
    // exists, and a request cannot be raised mid-transition or while one is already waiting.
    const canRequestRedo =
      props.gameState.canRequestRedo === true && !props.isPresentationPending && !isRedoPending

    const confirmForfeit = async () => {
      setIsForfeiting(true)
      const didForfeit = await props.onForfeit()
      setIsForfeiting(false)

      // The result overlay takes over on success, so the dialog must not linger behind it.
      if (didForfeit) {
        setIsForfeitDialogOpen(false)
      }
    }

    return <>
      {/* This root stays the grid item so `justify-center` still centres the rail in the column. It also carries the
          stacking order that keeps the buttons above the compact action log, which overlaps this column: the log
          button is the only thing that can close that panel. */}
      <div className="relative z-40 flex flex-col items-end justify-center gap-1">
        {rulesetName ? (
          <div
            data-testid="game-ruleset-name"
            title={rulesetName}
            className="mb-1 px-0.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-[0.45] [writing-mode:vertical-rl] rotate-180"
          >
            {rulesetName}
          </div>
        ) : null}

        {props.joinCode ? (
          <div
            data-testid="game-join-code"
            className="mb-1 px-0.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-[0.45] [writing-mode:vertical-rl] rotate-180"
          >
            {props.joinCode}
          </div>
        ) : null}

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            data-testid="theme-toggle-button"
            onClick={props.onToggleTheme}
            aria-label={t('game.sidebar.toggleThemeAria')}
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <Lightbulb size={10} />
          </AppButton>
          <span className={SIDEBAR_TOOLTIP_CLASS_NAME}>
            {t('game.sidebar.toggleThemeTooltip')}
          </span>
        </div>

        {isGameOver ? null : (
          <div className="group relative">
            <AppButton
              type="button"
              variant="ghost"
              data-testid="forfeit-game-button"
              aria-label={t('game.sidebar.forfeitAria')}
              onClick={() => setIsForfeitDialogOpen(true)}
              // Deliberately not frozen by a presentation: resigning is exactly what a player must be able to do
              // while the table is parked on a transition or on the opponent.
              className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
            >
              <Flag size={10} />
            </AppButton>
            <span className={SIDEBAR_TOOLTIP_CLASS_NAME}>
              {t('game.sidebar.forfeitTooltip')}
            </span>
          </div>
        )}

        {isBattleActionTargeting ? (
          <div className="group relative">
            <AppButton
              type="button"
              variant="ghost"
              aria-label={t('game.sidebar.cancelAttackAria')}
              onClick={() => useGameUIStore.getState().cancelBattleTargeting()}
              className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
            >
              <X size={12} strokeWidth={2.5} />
            </AppButton>
            <span className={SIDEBAR_TOOLTIP_CLASS_NAME}>
              {t('game.sidebar.cancelAttackTooltip')}
            </span>
          </div>
        ) : null}

        {isEffectTargeting ? (
          <div className="group relative">
            <AppButton
              type="button"
              variant="ghost"
              aria-label={t('game.sidebar.cancelTargetAria')}
              onClick={() => useGameUIStore.getState().cancelEffectTargeting()}
              className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
            >
              <X size={12} strokeWidth={2.5} />
            </AppButton>
            <span className={SIDEBAR_TOOLTIP_CLASS_NAME}>
              {t('game.sidebar.cancelTargetTooltip')}
            </span>
          </div>
        ) : null}

        {/* Undoing is a live-game affordance: there is nothing left to take back once the engine has published an
            outcome, so the control goes away with the rest of the interaction. */}
        {isGameOver ? null : (
          <div className="group relative">
            <AppButton
              type="button"
              variant="ghost"
              data-testid="undo-action-button"
              aria-label={t('game.redo.sidebarAria')}
              onClick={() => {
                void props.onRequestRedo()
              }}
              disabled={!canRequestRedo}
              aria-disabled={props.isPresentationPending || isRedoPending || undefined}
              tabIndex={props.isPresentationPending || isRedoPending ? -1 : undefined}
              className={`h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]${frozenClassName}`}
            >
              <RotateCcw size={10} />
            </AppButton>
            <span className={SIDEBAR_TOOLTIP_CLASS_NAME}>
              {t('game.redo.sidebarTooltip')}
            </span>
          </div>
        )}

        <div className="group relative">
          {/* Reading the log is not a game action: it stays available while actions are blocked, while a phase
              presentation is being shown, and after the game is over. The button only opens and closes it. */}
          <AppButton
            type="button"
            variant="ghost"
            data-testid="action-log-toggle"
            aria-label={t('game.sidebar.openLogAria')}
            aria-pressed={isActionLogOpen}
            onClick={toggleActionLog}
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <ScrollText size={10} />
          </AppButton>
          <span className={SIDEBAR_TOOLTIP_CLASS_NAME}>
            {t('game.sidebar.openLogTooltip')}
          </span>
        </div>

        {hasRoomForChat ? null : (
          <div className="group relative">
            {/* Chat, like the log, is not a game action: it stays available while the board is frozen. */}
            <AppButton
              type="button"
              variant="ghost"
              data-testid="game-chat-toggle"
              aria-label={t('game.sidebar.openChatAria')}
              aria-pressed={isGameChatOpen}
              onClick={toggleGameChat}
              className="relative h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
            >
              <MessageSquare size={10} />
              {unreadChatCount > 0 && !isGameChatOpen ? (
                <span
                  data-testid="game-chat-unread"
                  aria-hidden="true"
                  className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-orange-400"
                />
              ) : null}
            </AppButton>
            <span className={SIDEBAR_TOOLTIP_CLASS_NAME}>
              {t('game.sidebar.openChatTooltip')}
            </span>
          </div>
        )}
      </div>

      {isForfeitDialogOpen ? (
        <ForfeitConfirmDialog
          isSubmitting={isForfeiting}
          onCancel={() => setIsForfeitDialogOpen(false)}
          onConfirm={() => {
            void confirmForfeit()
          }}
        />
      ) : null}
    </>
}