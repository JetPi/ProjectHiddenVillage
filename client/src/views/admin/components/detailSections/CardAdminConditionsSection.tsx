import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import type { ICardAdminConditionsSectionProps } from '@/views/admin/types/cardAdminDetailTypes'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'

export function CardAdminConditionsSection({
  editorModel,
  conditionToAdd,
  setConditionToAdd,
  availableConditionOptions,
}: ICardAdminConditionsSectionProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-1 gap-2 border-t border-[var(--border-subtle)] pt-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {t('admin.detail.sections.conditions')}
      </label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <CardAdminSelect
          value={conditionToAdd}
          onValueChange={(value) => {
            const nextCondition = value
            setConditionToAdd(nextCondition)

            if (!nextCondition) {
              return
            }

            editorModel.addCondition(nextCondition)
            setConditionToAdd('')
          }}
          aria-label={t('admin.detail.sections.selectCondition')}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">{t('admin.detail.sections.selectCondition')}</option>
          {availableConditionOptions.map((conditionOption) => (
            <option key={conditionOption} value={conditionOption}>{conditionOption}</option>
          ))}
        </CardAdminSelect>

        <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
          <span>{t('admin.detail.sections.noNormalSummon')}</span>
          <CardAdminToggleSwitch
            checked={editorModel.draft.cannotBeNormalSummoned}
            onChange={editorModel.setCannotBeNormalSummoned}
            ariaLabel={t('admin.detail.sections.noNormalSummon')}
          />
        </label>
      </div>

      {editorModel.draft.conditions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {editorModel.draft.conditions.map((condition) => (
            <div
              key={condition}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 py-0.5 text-[11px] text-[var(--text-primary)]"
            >
              <span>{condition}</span>
              <CardAdminRemoveButton
                variant="chip"
                onClick={() => editorModel.removeCondition(condition)}
                ariaLabel={translateKey(t, 'admin.detail.sections.removeCondition', { condition })}
              />
            </div>
          ))}
        </div>
      ) : null}

      {editorModel.errors.conditions ? (
        <p className="text-xs text-red-500">{editorModel.errors.conditions}</p>
      ) : null}
    </div>
  )
}
