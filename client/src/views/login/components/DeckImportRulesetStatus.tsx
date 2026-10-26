import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import type { IDeckRulesetEvaluation } from '@/domain/deck/types'
import type { IDeckRuleset } from '@/types/deckRuleset'

export type IDeckImportRulesetStatusProps = {
  ruleset: IDeckRuleset
  evaluation: IDeckRulesetEvaluation | null
}

export function DeckImportRulesetStatus({ ruleset, evaluation }: IDeckImportRulesetStatusProps) {
  const { t } = useTranslation()

  const legalState = evaluation ? (evaluation.isValid ? 'true' : 'false') : 'pending'
  const containerClass = !evaluation
    ? 'border-[var(--border-subtle)] bg-transparent'
    : evaluation.isValid
      ? 'border-emerald-500/40 bg-emerald-500/5'
      : 'border-[var(--button-primary-bg)]/40 bg-[var(--surface-muted)]'
  const badgeClass = !evaluation
    ? 'bg-[var(--surface-muted)] text-[var(--text-muted)]'
    : evaluation.isValid
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : 'bg-[var(--button-primary-bg)]/15 text-[var(--button-primary-bg)]'

  return (
    <div
      data-testid="login-deck-ruleset-status"
      data-ruleset-key={ruleset.key}
      data-ruleset-legal={legalState}
      className={`min-w-0 w-full break-words rounded-lg border px-2 py-1.5 ${containerClass}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 flex-1 break-words text-[11px] font-semibold text-[var(--text-primary)]">
          {ruleset.name}
        </span>
        <span
          data-testid="login-deck-ruleset-badge"
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${badgeClass}`}
        >
          {!evaluation
            ? t('deckRules.status.notEvaluated')
            : evaluation.isValid
              ? t('deckRules.status.legal')
              : t('deckRules.status.notLegal')}
        </span>
      </div>

      {evaluation && evaluation.violations.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {evaluation.violations.map((violation, index) => (
            <li
              key={`${violation.code}-${index}`}
              data-violation-code={violation.code}
              className="break-words text-[11px] text-[var(--button-primary-bg)]"
            >
              {translateKey(t, violation.messageKey, violation.params)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
