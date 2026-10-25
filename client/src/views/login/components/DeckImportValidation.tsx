import { useTranslation } from 'react-i18next'
import type { IDeckListParseError, IDeckRulesetValidation } from '@/domain/deck/types'
import { DeckImportRulesetStatus } from './DeckImportRulesetStatus'

export type IDeckImportValidationVariant = 'detailed' | 'summary'

export type IDeckImportValidationProps = {
  parseError: IDeckListParseError | null
  validation: IDeckRulesetValidation | null
  isChecking?: boolean
  variant?: IDeckImportValidationVariant
}

export function DeckImportValidation({
  parseError,
  validation,
  isChecking = false,
  variant = 'detailed',
}: IDeckImportValidationProps) {
  const { t } = useTranslation()

  if (!parseError && !validation && !isChecking) {
    return null
  }

  const parseErrorNode = parseError && parseError.code !== 'empty'
    ? (
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
      )
    : null

  if (variant === 'summary') {
    const evaluations = validation?.evaluations ?? []
    const validRulesets = evaluations.filter((evaluation) => evaluation.isValid)
    const isLegalEverywhere = evaluations.length > 0 && validRulesets.length === evaluations.length

    return (
      <div data-testid="login-deck-import-status" className="mt-2 space-y-1">
        {parseErrorNode}

        {validation && !isLegalEverywhere ? (
          <p
            data-testid="login-deck-format-status"
            data-has-valid-format={validRulesets.length > 0 ? 'true' : 'false'}
            className={`text-xs font-medium ${
              validRulesets.length > 0
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-[var(--button-primary-bg)]'
            }`}
          >
            {validRulesets.length > 0
              ? t('deckRules.status.validForFormats', {
                  formats: validRulesets.map((evaluation) => evaluation.ruleset.name).join(', '),
                })
              : t('deckRules.status.invalidForAllFormats')}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <div data-testid="login-deck-import-status" className="mt-2 space-y-1">
      {parseErrorNode}

      {validation?.evaluations.map((evaluation) => (
        <DeckImportRulesetStatus key={evaluation.ruleset.key} evaluation={evaluation} />
      ))}

      {isChecking ? (
        <p className="text-[10px] text-[var(--text-muted)]">{t('deckRules.status.checking')}</p>
      ) : null}
    </div>
  )
}
