import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import { CardAdminChevronIcon } from '@/views/admin/components/controls'
import type { ICardAdminSummonSettingsPanelProps } from '@/views/admin/types/cardAdminEffectPanels'

export function CardAdminSummonSettingsPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminSummonSettingsPanelProps) {
  return (
    <details className="group rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-amber-500/55 bg-[var(--surface-muted)] p-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>Summon Settings</span>
        <CardAdminChevronIcon rotateOnOpen />
      </summary>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <CardAdminToggleSwitch
            checked={effect.suppressSummonedTargetsEffectsWhileOnField}
            onChange={(checked) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                suppressSummonedTargetsEffectsWhileOnField: checked,
              }))}
            ariaLabel="Suppress Summoned Effects On Field"
          />
          Suppress Summoned Effects On Field
        </label>
      </div>
    </details>
  )
}
