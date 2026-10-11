import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import { CardAdminToggleSwitch } from './CardAdminToggleSwitch'
import { CardAdminRemoveButton } from './CardAdminRemoveButton'
import type { ICardAdminPredicateFooterProps } from '@/views/admin/types/cardAdminPredicateControls'

export function CardAdminPredicateFooter({
  predicateEntries,
  ignoreCase,
  onRemoveEntry,
  onIgnoreCaseChange,
  onRemovePredicate,
}: ICardAdminPredicateFooterProps) {
  const { t } = useTranslation()

  return (
    <>
      {predicateEntries.length > 0 ? (
        <div className="w-full flex flex-wrap gap-2">
          {predicateEntries.map((entry, entryIndex) => (
            <div
              key={`${entry}-${entryIndex}`}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-1.5 py-0.5 text-[11px] text-[var(--text-primary)]"
            >
              <span>{entry}</span>
              <CardAdminRemoveButton
                variant="chip"
                onClick={() => onRemoveEntry(entryIndex)}
                ariaLabel={translateKey(t, 'admin.controls.predicate.removeEntry', { entry })}
              />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
          <span>{t('admin.controls.predicate.ignoreCase')}</span>
          <CardAdminToggleSwitch
            checked={ignoreCase}
            onChange={onIgnoreCaseChange}
            ariaLabel={t('admin.controls.predicate.ignoreCase')}
          />
        </label>

        <CardAdminRemoveButton
          onClick={onRemovePredicate}
          className="self-end"
          ariaLabel={t('admin.controls.predicate.removePredicate')}
        />
      </div>
    </>
  )
}
