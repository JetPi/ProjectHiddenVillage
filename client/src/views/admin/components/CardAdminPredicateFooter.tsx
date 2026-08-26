import { CardAdminToggleSwitch } from '@/views/admin/components/CardAdminToggleSwitch'
import type { ICardAdminPredicateFooterProps } from '@/views/admin/types/cardAdminPredicateControls'

export function CardAdminPredicateFooter({
  predicateEntries,
  ignoreCase,
  onRemoveEntry,
  onIgnoreCaseChange,
  onRemovePredicate,
}: ICardAdminPredicateFooterProps) {
  return (
    <>
      {predicateEntries.length > 0 ? (
        <div className="w-full flex flex-wrap gap-2">
          {predicateEntries.map((entry, entryIndex) => (
            <div
              key={`${entry}-${entryIndex}`}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
            >
              <span>{entry}</span>
              <button
                type="button"
                onClick={() => onRemoveEntry(entryIndex)}
                className="rounded-full px-1 leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                aria-label={`Remove ${entry}`}
              >
                X
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
          <span>Ignore Case</span>
          <CardAdminToggleSwitch
            checked={ignoreCase}
            onChange={onIgnoreCaseChange}
            ariaLabel="Ignore Case"
          />
        </label>

        <button
          type="button"
          onClick={onRemovePredicate}
          className="self-end px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          aria-label="Remove Predicate"
        >
          X
        </button>
      </div>
    </>
  )
}
