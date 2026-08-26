import { AppButton } from '@/components/ui'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'
import {
  KEYWORD_OPERATION_OPTIONS,
  KEYWORD_TARGET_TYPE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminGainEffectPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import { createDefaultKeywordModification } from '@/views/admin/utils'
import { CardAdminChevronIcon } from '@/views/admin/components/controls'

export function CardAdminGainEffectPanel({
  effect,
  effectIndex,
  updateEffectAt,
  effectConditionKeywordOptions,
}: ICardAdminGainEffectPanelProps) {
  return (
    <details className="group rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-fuchsia-500/55 bg-[var(--surface-muted)] p-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>Gain Effect Settings</span>
        <CardAdminChevronIcon rotateOnOpen />
      </summary>

      <div className="mt-3 grid grid-cols-1 gap-3">

      <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-fuchsia-500/35 bg-[var(--surface)] p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Keyword Modifications</p>
          <AppButton
            type="button"
            variant="ghost"
            onClick={() =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                keywordModifications: [...(current.keywordModifications ?? []), createDefaultKeywordModification()],
              }))}
          >
            Add Keyword Mod
          </AppButton>
        </div>

        {(effect.keywordModifications ?? []).map((modification, keywordIndex) => (
          <div key={`keyword-mod-${keywordIndex}`} className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              <CardAdminSelect
                value={modification.targetType}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    keywordModifications: (current.keywordModifications ?? []).map((row, index) =>
                      index === keywordIndex ? { ...row, targetType: event.target.value } : row),
                  }))}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {KEYWORD_TARGET_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </CardAdminSelect>

              <CardAdminSelect
                value={modification.operation}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    keywordModifications: (current.keywordModifications ?? []).map((row, index) =>
                      index === keywordIndex ? { ...row, operation: event.target.value } : row),
                  }))}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                {KEYWORD_OPERATION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </CardAdminSelect>

              <CardAdminSelect
                value={modification.keyword}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    keywordModifications: (current.keywordModifications ?? []).map((row, index) =>
                      index === keywordIndex ? { ...row, keyword: event.target.value } : row),
                  }))}
              >
                <option value="">Select keyword</option>
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
                ariaLabel="Remove keyword modification"
              />
            </div>
          </div>
        ))}
      </div>
      </div>
    </details>
  )
}
