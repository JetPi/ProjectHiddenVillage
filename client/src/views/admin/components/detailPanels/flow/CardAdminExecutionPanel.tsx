import {
  CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS,
  type ICardCatalogEffectExecutionConditionArgumentKey,
} from '@/types/cardCatalogExecutionCondition'
import {
  EXECUTION_FLOW_MODE_OPTIONS,
  EXECUTION_TARGET_SOURCE_OPTIONS,
} from '@/views/admin/constants'
import { AppButton } from '@/components/ui'
import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import { CardAdminChevronIcon } from '@/views/admin/components/controls'
import type { ICardAdminExecutionPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import { CardAdminSelect } from '@/views/admin/components/controls'

export function CardAdminExecutionPanel({
  effect,
  effectIndex,
  updateEffectAt,
  effectBranchErrors,
}: ICardAdminExecutionPanelProps) {
  const declaresSelectableTargets = effect.targetRules.rules.length > 0
    || effect.targetRules.exactTargetCount !== null
    || effect.targetRules.minimumTargetCount !== null
    || effect.targetRules.maximumTargetCount !== null
  const isPlayerScopedChakraLock = effect.runtimeEffectType === 'Lock Chakra Recovery'
  // The shape that made N-016 unplayable: asking for a pick while declaring nothing to pick from.
  const asksForSelectionWithoutTargetRules =
    effect.executionTargetSource === 'Selected Targets' && !declaresSelectableTargets

  return (
    <details className="group rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-sky-500/55 bg-[var(--surface-muted)] p-3" open>
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>Execution Target</span>
        <CardAdminChevronIcon rotateOnOpen />
      </summary>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Execution Target Source</label>
        <CardAdminSelect
          value={effect.executionTargetSource}
          onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, executionTargetSource: value }))}
        >
          {EXECUTION_TARGET_SOURCE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </CardAdminSelect>

        {isPlayerScopedChakraLock ? (
          <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
            Locks the chakra of the players in Target Range (Self / Opponent / Any) for the effect&apos;s duration: while it
            lasts they cannot turn chakra face-up, so Recovery is refused. Keep Execution Target Source at None - this
            effect never picks a card.
          </p>
        ) : null}

        {asksForSelectionWithoutTargetRules ? (
          <div className="space-y-1 rounded-lg border border-amber-500/60 bg-amber-500/10 p-2">
            <p className="text-[11px] leading-snug text-amber-700">
              This effect asks for a target selection but declares no selectable target rules, so activation is refused
              with &ldquo;No valid targets available.&rdquo;. Set Execution Target Source to None, or add target rules below.
            </p>
            <AppButton
              type="button"
              variant="ghost"
              onClick={() => updateEffectAt(effectIndex, (current) => ({ ...current, executionTargetSource: 'None' }))}
            >
              Set Execution Target Source to None
            </AppButton>
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Execution Flow Mode</label>
        <CardAdminSelect
          value={effect.executionFlowMode}
          onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, executionFlowMode: value }))}
        >
          {EXECUTION_FLOW_MODE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </CardAdminSelect>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] sm:col-span-2">
        <CardAdminToggleSwitch
          checked={effect.executionCondition !== null}
          onChange={(checked) =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              executionCondition: checked
                ? {
                    argumentKey: CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS[0],
                    expectedValue: '',
                    ignoreCase: true,
                    negate: false,
                  }
                : null,
            }))}
          ariaLabel="Execution Condition Enabled"
        />
        Execution Condition Enabled
      </label>

      {effect.executionCondition ? (
        <>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Condition Argument Key</label>
            <CardAdminSelect
              value={effect.executionCondition.argumentKey}
              onValueChange={(value) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  executionCondition: current.executionCondition
                    ? {
                        ...current.executionCondition,
                        argumentKey: value as ICardCatalogEffectExecutionConditionArgumentKey,
                      }
                    : null,
                }))}
            >
              {CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CardAdminSelect>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Condition Expected Value</label>
            <input
              type="text"
              value={effect.executionCondition.expectedValue}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  executionCondition: current.executionCondition
                    ? { ...current.executionCondition, expectedValue: event.target.value }
                    : null,
                }))}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <CardAdminToggleSwitch
              checked={effect.executionCondition.ignoreCase}
              onChange={(checked) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  executionCondition: current.executionCondition
                    ? { ...current.executionCondition, ignoreCase: checked }
                    : null,
                }))}
              ariaLabel="Ignore Case"
            />
            Ignore Case
          </label>

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <CardAdminToggleSwitch
              checked={effect.executionCondition.negate}
              onChange={(checked) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  executionCondition: current.executionCondition
                    ? { ...current.executionCondition, negate: checked }
                    : null,
                }))}
              ariaLabel="Negate Condition"
            />
            Negate Condition
          </label>
        </>
      ) : null}

      {effectBranchErrors?.length ? (
        <div className="space-y-1 sm:col-span-2">
          {effectBranchErrors.map((error) => (
            <p key={`${effectIndex}-${error}`} className="text-xs text-red-500">{error}</p>
          ))}
        </div>
      ) : null}
      </div>
    </details>
  )
}
