import { AppButton } from '@/components/ui'
import {
  KEYWORD_OPERATION_OPTIONS,
  KEYWORD_TARGET_TYPE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminGainEffectPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import { createDefaultKeywordModification } from '@/views/admin/utils'

export function CardAdminGainEffectPanel({
  effect,
  effectIndex,
  updateEffectAt,
  effectConditionKeywordOptions,
}: ICardAdminGainEffectPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-fuchsia-500/55 bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Gain Effect Settings</p>

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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <select
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
              </select>

              <select
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
              </select>

              <select
                value={modification.keyword}
                onChange={(event) =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    keywordModifications: (current.keywordModifications ?? []).map((row, index) =>
                      index === keywordIndex ? { ...row, keyword: event.target.value } : row),
                  }))}
                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
              >
                <option value="">Select keyword</option>
                {(effectConditionKeywordOptions.includes(modification.keyword) || !modification.keyword.trim()
                  ? effectConditionKeywordOptions
                  : [modification.keyword, ...effectConditionKeywordOptions]).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  updateEffectAt(effectIndex, (current) => ({
                    ...current,
                    keywordModifications: (current.keywordModifications ?? []).filter((_, index) => index !== keywordIndex),
                  }))}
                className="inline-flex w-fit px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                aria-label="Remove keyword modification"
              >
                X
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
