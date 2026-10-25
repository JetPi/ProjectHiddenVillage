import { useTranslation } from 'react-i18next'
import type { IDeckListParseError, IDeckRulesetValidation } from '@/domain/deck/types'
import { DeckImportRulesetStatus } from './DeckImportRulesetStatus'

export type IDeckImportValidationProps = {
  parseError: IDeckListParseError | null
  validation: IDeckRulesetValidation | null
  isChecking?: boolean
}

export function DeckImportValidation({
  parseError,
  validation,
  isChecking = false,
}: IDeckImportValidationProps) {
  const { t } = useTranslation()

  if (!parseError && !validation && !isChecking) {
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

      <div className="flex flex-wrap gap-2">
        {validation?.evaluations.map((evaluation) => (
          <DeckImportRulesetStatus key={evaluation.ruleset.key} evaluation={evaluation} />
        ))}
      </div>

      {isChecking ? (
        <p className="text-[10px] text-[var(--text-muted)]">{t('deckRules.status.checking')}</p>
      ) : null}
    </div>
  )
}
