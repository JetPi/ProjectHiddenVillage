import type { ICardAdminSummonSettingsPanelProps } from '@/views/admin/types/cardAdminEffectPanels'

export function CardAdminSummonSettingsPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminSummonSettingsPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-amber-500/55 bg-[var(--surface-muted)] p-3 sm:grid-cols-2">
      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={effect.suppressSummonedTargetsEffectsWhileOnField}
          onChange={(event) =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              suppressSummonedTargetsEffectsWhileOnField: event.target.checked,
            }))}
        />
        Suppress Summoned Effects On Field
      </label>
    </div>
  )
}
