import { AppButton } from '@/components/ui'
import {
  PASSIVE_CONSEQUENCE_EFFECT_OPTIONS,
  PASSIVE_SCOPE_OPTIONS,
  PASSIVE_TARGET_POLICY_OPTIONS,
  PASSIVE_TRIGGER_KIND_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminPassiveSettingsPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import {
  createDefaultPassiveConsequence,
  createDefaultPassiveReevaluation,
} from '@/views/admin/utils'

export function CardAdminPassiveSettingsPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminPassiveSettingsPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-violet-500/55 bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Passive Settings</p>

      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={effect.passiveReevaluation !== null}
          onChange={(event) =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              passiveReevaluation: event.target.checked
                ? current.passiveReevaluation ?? createDefaultPassiveReevaluation()
                : null,
            }))}
        />
        Passive Reevaluation Enabled
      </label>

      {effect.passiveReevaluation ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Reevaluation Scope</label>
            <select
              value={effect.passiveReevaluation.scope}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  passiveReevaluation: current.passiveReevaluation
                    ? { ...current.passiveReevaluation, scope: event.target.value }
                    : null,
                }))}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {PASSIVE_SCOPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Trigger Kind</label>
            <select
              value={effect.passiveReevaluation.triggerKinds[0] ?? 'Any'}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  passiveReevaluation: current.passiveReevaluation
                    ? { ...current.passiveReevaluation, triggerKinds: [event.target.value] }
                    : null,
                }))}
              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {PASSIVE_TRIGGER_KIND_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-violet-500/35 bg-[var(--surface)] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Passive Consequences</p>
          <AppButton
            type="button"
            variant="ghost"
            onClick={() =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                passiveConsequences: [...(current.passiveConsequences ?? []), createDefaultPassiveConsequence()],
              }))}
          >
            Add Consequence
          </AppButton>
        </div>

        {(effect.passiveConsequences ?? []).map((consequence, consequenceIndex) => (
          <div key={`passive-consequence-${consequenceIndex}`} className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 sm:grid-cols-3">
            <select
              value={consequence.consequenceEffectTypeKey}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  passiveConsequences: (current.passiveConsequences ?? []).map((row, index) =>
                    index === consequenceIndex ? { ...row, consequenceEffectTypeKey: event.target.value } : row),
                }))}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {PASSIVE_CONSEQUENCE_EFFECT_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            <select
              value={consequence.targetPolicy}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  passiveConsequences: (current.passiveConsequences ?? []).map((row, index) =>
                    index === consequenceIndex
                      ? { ...row, targetPolicy: event.target.value }
                      : row),
                }))}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {PASSIVE_TARGET_POLICY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            <AppButton
              type="button"
              variant="ghost"
              onClick={() =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  passiveConsequences: (current.passiveConsequences ?? []).filter((_, index) => index !== consequenceIndex),
                }))}
            >
              Remove
            </AppButton>
          </div>
        ))}
      </div>
    </div>
  )
}
