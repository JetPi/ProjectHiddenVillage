import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui/AppButton'
import { useGameUIStore } from '@/state/gameUIStore'
import type { IGamePhaseActionRowProps } from '@/views/game/types'
import { getPhaseValue, getPhaseThemeClasses, getTributeRequirementSummary } from '@/views/game/utils/functions/helpers'
import { canConfirmEffectTargetSelection } from '@/views/game/utils/functions/gameState/canConfirmEffectTargetSelection'
import { invertedPhaseThemeClassByPhaseTheme, phaseActionChipClassName, translatePhaseValue } from './constants/gamePhaseActionRow'

function cancelActiveTargetingMode(): void {
  const state = useGameUIStore.getState()
  if (state.pendingCardTargeting) {
    state.cancelBattleTargeting()
  } else if (state.pendingSummonTargeting) {
    state.cancelSummonTargeting()
  } else if (state.pendingEffectTargeting) {
    state.cancelEffectTargeting()
  }
}

function GamePhaseActionRow({
  gameInstance,
  authUserId,
  availableActions,
  isConnected,
  isActionPending,
  onSelectAction,
  phaseTestId,
  onConfirmSummonTargetSelection,
  onConfirmEffectTargetSelection,
}: IGamePhaseActionRowProps) {
  const { t } = useTranslation()
  const pendingCardTargeting = useGameUIStore((state) => state.pendingCardTargeting)
  const pendingSummonTargeting = useGameUIStore((state) => state.pendingSummonTargeting)
  const pendingEffectTargeting = useGameUIStore((state) => state.pendingEffectTargeting)

  const phaseValue = getPhaseValue(gameInstance, authUserId, pendingSummonTargeting, pendingEffectTargeting)
  const phaseThemeClasses = getPhaseThemeClasses(gameInstance, phaseValue, authUserId)
  const payButtonThemeClasses = invertedPhaseThemeClassByPhaseTheme[phaseThemeClasses] ?? 'turn-indicator-inverted-light-gray'

  // Tribute-summon material selection drives both the phase text and the "Pay" chip state.
  const tributeRequirement = getTributeRequirementSummary(pendingSummonTargeting)

  const isTargetingActive =
    pendingCardTargeting !== null
    || pendingSummonTargeting !== null
    || pendingEffectTargeting !== null
  const renderedActions = availableActions.filter((action) => action.actionId !== 'declare-action')
  const hasOptions = renderedActions.length > 0

  return (
    <div className="grid min-h-0 grid-cols-6">
      <div className="col-span-6 flex min-h-0 min-w-0 items-stretch gap-1">
        <div
          className={`overflow-hidden transition-[max-width,opacity] duration-300 ease-out ${
            hasOptions ? 'max-w-[55%] opacity-100' : 'pointer-events-none max-w-0 opacity-0'
          }`}
        >
          <div className="flex h-full w-max items-stretch gap-1 overflow-x-auto">
            {renderedActions.map((action) => (
              <button
                key={action.actionId}
                type="button"
                onClick={() => {
                  onSelectAction(action)
                }}
                disabled={!isConnected || isActionPending || !action.isEnabled}
                title={action.disabledReason ?? undefined}
                className={`${phaseActionChipClassName} disabled:cursor-not-allowed disabled:opacity-50 ${phaseThemeClasses}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        {isTargetingActive ? (
          <>
          <button
            type="button"
            data-testid="cancel-target-mode-button"
            aria-label={t('game.actionRow.cancelAria')}
            onClick={cancelActiveTargetingMode}
            title={t('game.actionRow.cancelTitle')}
            className={`${phaseActionChipClassName} ${phaseThemeClasses}`}
          >
            {t('game.actionRow.cancel')}
          </button>

          { tributeRequirement.isActive ?(
            <div
              className="group relative"
              data-testid="tribute-requirement-summary"
              data-required-tribute-count={tributeRequirement.requiredCount}
              data-selected-tribute-count={tributeRequirement.selectedCount}
              data-remaining-tribute-count={tributeRequirement.remainingCount}
              data-tribute-material-summary={tributeRequirement.materialSummary}
            >
              <AppButton
                type="button"
                aria-label={t('game.actionRow.confirmTributeAria')}
                title={tributeRequirement.title}
                onClick={onConfirmSummonTargetSelection}
                disabled={!isConnected || isActionPending || !tributeRequirement.isSatisfied}
                className={`${phaseActionChipClassName} ${payButtonThemeClasses} hover:brightness-150`}
              >
                {t('game.actionRow.pay')}
              </AppButton>
            </div>
          ): null}

          {pendingEffectTargeting ? (
            <button
              type="button"
              data-testid="confirm-effect-target-selection-button"
              aria-label={t('game.actionRow.confirmTargetAria')}
              onClick={onConfirmEffectTargetSelection}
              disabled={!isConnected || isActionPending || !canConfirmEffectTargetSelection(pendingEffectTargeting)}
              className={`${phaseActionChipClassName} ${payButtonThemeClasses} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {t('game.actionRow.confirm')}
            </button>
          ) : null}
          </>
        ) : null}

        <div
          data-testid={phaseTestId}
          className={`min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] py-0.5 text-center transition-[max-width,transform,opacity] duration-300 ease-out ${phaseThemeClasses}`}
        >
          <span key={phaseValue} className="phase-indicator-text-swap inline-block text-[12px] font-extrabold leading-none">
            {translatePhaseValue(t, phaseValue)}
          </span>
        </div>
      </div>
    </div>
  )
}

export { GamePhaseActionRow }