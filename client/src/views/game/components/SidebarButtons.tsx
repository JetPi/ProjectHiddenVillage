import { Lightbulb, RotateCcw, ScrollText, SkipForward, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { IGameZonesProps } from "@/views/game/types";
import { AppButton } from "@/components/ui";
import { useGameUIStore } from "@/state/gameUIStore";

export function SideBarButtons(props: IGameZonesProps){
    const { t } = useTranslation()
    const isBattleActionTargeting = useGameUIStore((state) => state.pendingCardTargeting !== null)
    const isEffectTargeting = useGameUIStore((state) => state.pendingEffectTargeting !== null)

    const frozenClassName = props.isPresentationPending ? ' pointer-events-none' : ''
   
    const rulesetName = props.gameState.ruleset?.name ?? null

    return<div className="flex flex-col items-end justify-center gap-1">
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
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            {t('game.sidebar.toggleThemeTooltip')}
          </span>
        </div>

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            data-testid="pass-turn-button"
            aria-label={t('game.sidebar.passTurnAria')}
            onClick={props.isPresentationPending ? undefined : props.onPassTurn}
            disabled={props.isActionBlocked}
            aria-disabled={props.isPresentationPending || undefined}
            tabIndex={props.isPresentationPending ? -1 : undefined}
            className={`h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]${frozenClassName}`}
          >
            <SkipForward size={10} />
          </AppButton>
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            {t('game.sidebar.passTurnTooltip')}
          </span>
        </div>

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
            <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
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
            <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
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
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
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
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            {t('game.sidebar.openLogTooltip')}
          </span>
        </div>
      </div>
}