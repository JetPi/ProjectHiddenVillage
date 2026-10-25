import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import type { IDeckListParseError, IDeckRulesetValidation } from '@/domain/deck/types'

export type IDeckImportValidationProps = {
  parseError: IDeckListParseError | null
  isChecking: boolean
  validation: IDeckRulesetValidation | null
}

export function DeckImportValidation({ parseError, isChecking, validation }: IDeckImportValidationProps) {
  const { t } = useTranslation()

  if (!parseError && !validation) {
    return null
  }

  return (
    <div data-testid="login-deck-import-status" className="mt-2 space-y-1">
      {parseError && parseError.code !== 'empty' ? (
        <p
          role="alert"
          data-testid="login-deck-parse-error"
          className="text-xs font-medium text-[var(--button-primary-bg)]"
        >
          {parseError.code === 'nonPositiveQuantity'
            ? t('deckRules.parse.nonPositiveQuantity', { line: parseError.line })
            : t('deckRules.parse.invalidLine', {
                line: parseError.line,
                value: parseError.value ?? '',
              })}
        </p>
      ) : null}

      {validation?.evaluations.map((evaluation) => (
        <div
          key={evaluation.ruleset.key}
          data-testid="login-deck-ruleset-status"
          data-ruleset-key={evaluation.ruleset.key}
          data-ruleset-legal={evaluation.isValid ? 'true' : 'false'}
          className={`rounded-lg border px-2 py-1.5 ${
            evaluation.isValid
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-[var(--button-primary-bg)]/40 bg-[var(--surface-muted)]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-[var(--text-primary)]">
              {evaluation.ruleset.name}
            </span>
            <span
              data-testid="login-deck-ruleset-badge"
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                evaluation.isValid
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-[var(--button-primary-bg)]/15 text-[var(--button-primary-bg)]'
              }`}
            >
              {evaluation.isValid ? t('deckRules.status.legal') : t('deckRules.status.notLegal')}
            </span>
          </div>

          <p className="text-[10px] text-[var(--text-muted)]">
            {t('deckRules.status.counts', {
              leaders: evaluation.leaderCopies,
              expectedLeaders: evaluation.ruleset.leaderCount,
              cards: evaluation.nonLeaderCopies,
              expectedCards: evaluation.ruleset.nonLeaderCardCount,
            })}
          </p>

          {evaluation.violations.length > 0 ? (
            <ul className="mt-1 space-y-0.5">
              {evaluation.violations.map((violation, index) => (
                <li
                  key={`${violation.code}-${index}`}
                  data-violation-code={violation.code}
                  className="text-[11px] text-[var(--button-primary-bg)]"
                >
                  {translateKey(t, violation.messageKey, violation.params)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}

      {isChecking ? (
        <p className="text-[10px] text-[var(--text-muted)]">{t('deckRules.status.checking')}</p>
      ) : null}
    </div>
  )
}
