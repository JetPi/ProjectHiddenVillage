import { useState } from "react";
import { Flag, Lightbulb, RotateCcw, ScrollText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { IGameZonesProps } from "@/views/game/types";
import { AppButton } from "@/components/ui";
import { useGameUIStore } from "@/state/gameUIStore";
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
    const [isForfeitDialogOpen, setIsForfeitDialogOpen] = useState(false)
    const [isForfeiting, setIsForfeiting] = useState(false)

    const frozenClassName = props.isPresentationPending ? ' pointer-events-none' : ''
   
    const rulesetName = props.gameState.ruleset?.name ?? null
    const isGameOver = Boolean(props.gameState.gameOutcome)

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
      <div className="flex flex-col items-end justify-center gap-1">
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

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            aria-label={t('game.sidebar.undoAria')}
            disabled={props.isActionBlocked}
            aria-disabled={props.isPresentationPending || undefined}
            tabIndex={props.isPresentationPending ? -1 : undefined}
            className={`h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]${frozenClassName}`}
          >
            <RotateCcw size={10} />
          </AppButton>
          <span className={SIDEBAR_TOOLTIP_CLASS_NAME}>
            {t('game.sidebar.undoTooltip')}
          </span>
        </div>

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            aria-label={t('game.sidebar.openLogAria')}
            disabled={props.isActionBlocked}
            aria-disabled={props.isPresentationPending || undefined}
            tabIndex={props.isPresentationPending ? -1 : undefined}
            className={`h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]${frozenClassName}`}
          >
            <ScrollText size={10} />
          </AppButton>
          <span className={SIDEBAR_TOOLTIP_CLASS_NAME}>
            {t('game.sidebar.openLogTooltip')}
          </span>
        </div>
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