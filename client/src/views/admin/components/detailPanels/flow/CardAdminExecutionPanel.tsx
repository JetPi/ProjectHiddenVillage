import {
  CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS,
  type ICardCatalogEffectExecutionConditionArgumentKey,
} from '@/types/cardCatalogExecutionCondition'
import {
  EXECUTION_FLOW_MODE_OPTIONS,
  EXECUTION_TARGET_SOURCE_OPTIONS,
} from '@/views/admin/constants'
import {
  normalizeEffectId,
} from '@/views/admin/utils'
import { CardAdminToggleSwitch } from '@/views/admin/components/CardAdminToggleSwitch'
import type { ICardAdminExecutionPanelProps } from '@/views/admin/types/cardAdminEffectPanels'

export function CardAdminExecutionPanel({
  effect,
  effectIndex,
  updateEffectAt,
  effectIdOptions,
  effectBranchErrors,
}: ICardAdminExecutionPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-sky-500/55 bg-[var(--surface-muted)] p-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Execution Target Source</label>
        <select
          value={effect.executionTargetSource}
          onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, executionTargetSource: event.target.value }))}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {EXECUTION_TARGET_SOURCE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Execution Flow Mode</label>
        <select
          value={effect.executionFlowMode}
          onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, executionFlowMode: event.target.value }))}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {EXECUTION_FLOW_MODE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">On Success</label>
        <select
          value={effect.onSuccessEffectId ?? ''}
          onChange={(event) =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              onSuccessEffectId: event.target.value.trim().length > 0 ? event.target.value : null,
            }))}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">None</option>
          {effectIdOptions
            .filter((id) => id !== normalizeEffectId(effect.id))
            .map((idOption) => (
              <option key={idOption} value={idOption}>{idOption}</option>
            ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">On Failure</label>
        <select
          value={effect.onFailureEffectId ?? ''}
          onChange={(event) =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              onFailureEffectId: event.target.value.trim().length > 0 ? event.target.value : null,
            }))}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">None</option>
          {effectIdOptions
            .filter((id) => id !== normalizeEffectId(effect.id))
            .map((idOption) => (
              <option key={idOption} value={idOption}>{idOption}</option>
            ))}
        </select>
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
            <select
              value={effect.executionCondition.argumentKey}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  executionCondition: current.executionCondition
                    ? {
                        ...current.executionCondition,
                        argumentKey: event.target.value as ICardCatalogEffectExecutionConditionArgumentKey,
                      }
                    : null,
                }))}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
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
  )
}
