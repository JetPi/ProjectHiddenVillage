import { AppButton } from '@/components/ui'
import { CardAdminToggleSwitch } from '@/views/admin/components/CardAdminToggleSwitch'
import { CardAdminSelect } from '@/views/admin/components/CardAdminSelect'
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
        <CardAdminToggleSwitch
          checked={effect.passiveReevaluation !== null}
          onChange={(checked) =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              passiveReevaluation: checked
                ? current.passiveReevaluation ?? createDefaultPassiveReevaluation()
                : null,
            }))}
          ariaLabel="Passive Reevaluation Enabled"
        />
        Passive Reevaluation Enabled
      </label>

      {effect.passiveReevaluation ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Reevaluation Scope</label>
            <CardAdminSelect
              value={effect.passiveReevaluation.scope}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  passiveReevaluation: current.passiveReevaluation
                    ? { ...current.passiveReevaluation, scope: event.target.value }
                    : null,
                }))}
            >
              {PASSIVE_SCOPE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CardAdminSelect>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Trigger Kind</label>
            <CardAdminSelect
              value={effect.passiveReevaluation.triggerKinds[0] ?? 'Any'}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  passiveReevaluation: current.passiveReevaluation
                    ? { ...current.passiveReevaluation, triggerKinds: [event.target.value] }
                    : null,
                }))}
            >
              {PASSIVE_TRIGGER_KIND_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CardAdminSelect>
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
            <CardAdminSelect
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
            </CardAdminSelect>

            <CardAdminSelect
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
            </CardAdminSelect>

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
