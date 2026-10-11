import { useTranslation } from 'react-i18next'
import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import { CardAdminChevronIcon } from '@/views/admin/components/controls'
import type { ICardAdminSummonSettingsPanelProps } from '@/views/admin/types/cardAdminEffectPanels'

export function CardAdminSummonSettingsPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminSummonSettingsPanelProps) {
  const { t } = useTranslation()

  return (
    <details className="group border-t border-[var(--border-subtle)] border-l-2 border-l-amber-500/55 pl-3 pt-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>{t('admin.panels.summonSettings.title')}</span>
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
            ariaLabel={t('admin.panels.summonSettings.suppressSummoned')}
          />
          {t('admin.panels.summonSettings.suppressSummoned')}
        </label>
      </div>
    </details>
  )
}
