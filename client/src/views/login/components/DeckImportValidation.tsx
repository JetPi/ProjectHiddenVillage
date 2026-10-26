import type { IDeckRulesetValidation } from '@/domain/deck/types'
import type { IDeckRuleset } from '@/types/deckRuleset'
import { DeckImportRulesetStatus } from './DeckImportRulesetStatus'

export type IDeckImportValidationProps = {
  rulesets: IDeckRuleset[]
  validation: IDeckRulesetValidation | null
}

export function DeckImportValidation({ rulesets, validation }: IDeckImportValidationProps) {
  if (rulesets.length === 0) {
    return null
  }

  const evaluationsByKey = new Map(
    (validation?.evaluations ?? []).map((evaluation) => [evaluation.ruleset.key, evaluation]),
  )

  return (
    <div data-testid="login-deck-import-status" className="flex flex-col gap-2">
      {rulesets.map((ruleset) => (
        <DeckImportRulesetStatus
          key={ruleset.key}
          ruleset={ruleset}
          evaluation={evaluationsByKey.get(ruleset.key) ?? null}
        />
      ))}
    </div>
  )
}
