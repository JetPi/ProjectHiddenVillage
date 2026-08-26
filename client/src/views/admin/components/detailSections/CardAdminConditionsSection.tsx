import type { ICardAdminConditionsSectionProps } from '@/views/admin/types/cardAdminDetailSections'

export function CardAdminConditionsSection({
  editorModel,
  conditionToAdd,
  setConditionToAdd,
  availableConditionOptions,
}: ICardAdminConditionsSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        Conditions
      </label>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <select
          value={conditionToAdd}
          onChange={(event) => {
            const nextCondition = event.target.value
            setConditionToAdd(nextCondition)

            if (!nextCondition) {
              return
            }

            editorModel.addCondition(nextCondition)
            setConditionToAdd('')
          }}
          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          <option value="">Select a condition to add...</option>
          {availableConditionOptions.map((conditionOption) => (
            <option key={conditionOption} value={conditionOption}>{conditionOption}</option>
          ))}
        </select>

        <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
          <span>No Normal Summon</span>
          <span className="relative inline-flex h-5 w-9 items-center">
            <input
              type="checkbox"
              checked={editorModel.draft.cannotBeNormalSummoned}
              onChange={(event) => editorModel.setCannotBeNormalSummoned(event.target.checked)}
              className="peer sr-only"
            />
            <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-amber-500/70" />
            <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
          </span>
        </label>
      </div>

      {editorModel.draft.conditions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {editorModel.draft.conditions.map((condition) => (
            <div
              key={condition}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-primary)]"
            >
              <span>{condition}</span>
              <button
                type="button"
                onClick={() => editorModel.removeCondition(condition)}
                className="rounded-full px-1 leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                aria-label={`Remove ${condition}`}
              >
                X
              </button>
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
