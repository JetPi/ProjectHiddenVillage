import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'
import {
  KEYWORD_OPERATION_LABEL_KEYS,
  KEYWORD_OPERATION_OPTIONS,
  KEYWORD_TARGET_TYPE_LABEL_KEYS,
  KEYWORD_TARGET_TYPE_OPTIONS,
  optionLabel,
} from '@/views/admin/constants'
import type { ICardAdminGainEffectPanelProps } from '@/views/admin/types/cardAdminDetailTypes'
import { createDefaultKeywordModification } from '@/views/admin/utils'
import { CardAdminChevronIcon } from '@/views/admin/components/controls'

export function CardAdminGainEffectPanel({
  effect,
  effectIndex,
  updateEffectAt,
  effectConditionKeywordOptions,
}: ICardAdminGainEffectPanelProps) {
  const { t } = useTranslation()

  return (
    <details className="group border-t border-[var(--border-subtle)] border-l-2 border-l-fuchsia-500/55 pl-3 pt-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>{t('admin.panels.gainEffect.title')}</span>
        <CardAdminChevronIcon rotateOnOpen />
      </summary>

      <div className="mt-3 grid grid-cols-1 gap-3">

      <div className="space-y-2 border-l-2 border-l-fuchsia-500/30 pl-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('admin.panels.gainEffect.keywordModifications')}</p>
          <AppButton
            type="button"
            variant="ghost"
            onClick={() =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                keywordModifications: [...(current.keywordModifications ?? []), createDefaultKeywordModification()],
              }))}
          >
            {t('admin.panels.gainEffect.addKeywordMod')}
          </AppButton>
        </div>

        {(effect.keywordModifications ?? []).map((modification, keywordIndex) => (
          <div key={`keyword-mod-${keywordIndex}`} className="space-y-2 border-t border-[var(--border-subtle)] pt-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <CardAdminSelect
                value={modification.targetType}
                onValueChange={(value) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    keywordModifications: (current.keywordModifications ?? []).map((row, index) =>
                      index === keywordIndex ? { ...row, targetType: value } : row),
                  }))}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {KEYWORD_TARGET_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{optionLabel(t, KEYWORD_TARGET_TYPE_LABEL_KEYS, option)}</option>
                ))}
              </CardAdminSelect>

              <CardAdminSelect
                value={modification.operation}
                onValueChange={(value) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    keywordModifications: (current.keywordModifications ?? []).map((row, index) =>
                      index === keywordIndex ? { ...row, operation: value } : row),
                  }))}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {KEYWORD_OPERATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{optionLabel(t, KEYWORD_OPERATION_LABEL_KEYS, option)}</option>
                ))}
              </CardAdminSelect>

              <CardAdminSelect
                value={modification.keyword}
                onValueChange={(value) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    keywordModifications: (current.keywordModifications ?? []).map((row, index) =>
                      index === keywordIndex ? { ...row, keyword: value } : row),
                  }))}
              >
                <option value="">{t('admin.panels.gainEffect.selectKeyword')}</option>
                {(effectConditionKeywordOptions.includes(modification.keyword) || !modification.keyword.trim()
                  ? effectConditionKeywordOptions
                  : [modification.keyword, ...effectConditionKeywordOptions]).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </CardAdminSelect>

              <CardAdminRemoveButton
                onClick={() =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    keywordModifications: (current.keywordModifications ?? []).filter((_, index) => index !== keywordIndex),
                  }))}
                className="inline-flex h-10 w-10 items-center justify-center self-stretch rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]"
                ariaLabel={t('admin.panels.gainEffect.removeKeywordModification')}
              />
            </div>
          </div>
        ))}
      </div>
      </div>
    </details>
  )
}
