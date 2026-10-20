import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import type { IDeckAdminViolation } from '@/views/admin/types/deckAdminTypes'

type IDeckAdminValidationListProps = {
  violations: IDeckAdminViolation[]
}

/**
 * Why the save button is disabled. Always rendered - an invalid deck explains itself as the admin works, so the
 * rules are enforced at the save without ever blocking an edit.
 */
export function DeckAdminValidationList({ violations }: IDeckAdminValidationListProps) {
  const { t } = useTranslation()

  if (violations.length === 0) {
    return (
      <p
        data-testid="deck-admin-validation-ok"
        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2.5 py-2 text-xs text-[var(--text-secondary)]"
      >
        {t('admin.decks.validation.ok')}
      </p>
    )
  }

  return (
    <ul
      data-testid="deck-admin-validation"
      className="space-y-1 rounded-lg border border-[var(--button-primary-bg)]/40 bg-[var(--surface-muted)] px-2.5 py-2"
    >
      {violations.map((violation) => (
        <li
          key={violation.code}
          role="alert"
          data-violation-code={violation.code}
          className="text-xs font-medium text-[var(--button-primary-bg)]"
        >
          {translateKey(t, violation.messageKey, violation.params)}
        </li>
      ))}
    </ul>
  )
}
