import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import type { IDeckAdminValidationListProps } from './types'

export function DeckAdminValidationList({ validation, isCheckingCards }: IDeckAdminValidationListProps) {
  const { t } = useTranslation()
  const hasRulesets = validation.evaluations.length > 0

  return (
    <div className="space-y-1">
      {validation.nameViolations.length > 0 ? (
        <ul
          data-testid="deck-admin-validation"
          data-validation-scope="name"
          className="space-y-1 rounded-lg border border-[var(--button-primary-bg)]/40 bg-[var(--surface-muted)] px-2.5 py-2"
        >
          {validation.nameViolations.map((violation) => (
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
      ) : null}

      {!hasRulesets ? (
        <p
          data-testid="deck-admin-ruleset-empty"
          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2.5 py-2 text-xs text-[var(--text-secondary)]"
        >
          {t('deckRules.status.noRulesets')}
        </p>
      ) : null}

      {validation.evaluations.map((evaluation) => (
        <div
          key={evaluation.ruleset.key}
          data-testid="deck-admin-ruleset-status"
          data-ruleset-key={evaluation.ruleset.key}
          data-ruleset-legal={evaluation.isValid ? 'true' : 'false'}
          className={`rounded-lg border px-2.5 py-2 ${
            evaluation.isValid
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-[var(--button-primary-bg)]/40 bg-[var(--surface-muted)]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">{evaluation.ruleset.name}</p>
            <span
              data-testid="deck-admin-ruleset-badge"
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                evaluation.isValid
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-[var(--button-primary-bg)]/15 text-[var(--button-primary-bg)]'
              }`}
            >
              {evaluation.isValid ? t('deckRules.status.legal') : t('deckRules.status.notLegal')}
            </span>
          </div>

          {evaluation.violations.length > 0 ? (
            <ul data-testid="deck-admin-validation" className="mt-1 space-y-0.5">
              {evaluation.violations.map((violation, index) => (
                <li
                  key={`${violation.code}-${index}`}
                  role="alert"
                  data-violation-code={violation.code}
                  className="text-xs font-medium text-[var(--button-primary-bg)]"
                >
                  {translateKey(t, violation.messageKey, violation.params)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}

      {validation.isValid ? (
        <p
          data-testid="deck-admin-validation-ok"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-2.5 py-2 text-xs text-emerald-700 dark:text-emerald-300"
        >
          {t('deckRules.status.savable')}
        </p>
      ) : null}

      {isCheckingCards ? (
        <p data-testid="deck-admin-ruleset-checking" className="text-[11px] text-[var(--text-muted)]">
          {t('deckRules.status.checking')}
        </p>
      ) : null}
    </div>
  )
}
