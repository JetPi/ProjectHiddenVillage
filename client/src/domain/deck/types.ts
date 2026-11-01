import type { IDeckCardInput } from '@/types/deck'
import type { IDeckRuleset } from '@/types/deckRuleset'

export type IDeckCardMetadata = {
  id: string
  displayName: string
  type: string
  color: string
  image?: string
  imageVersion?: number | null
}

export type IDeckListParseErrorCode = 'empty' | 'invalidLine' | 'nonPositiveQuantity'

export type IDeckListParseError = {
  line: number
  code: IDeckListParseErrorCode
  value?: string
}

export type IDeckListParseResult =
  | { isValid: true; cards: IDeckCardInput[] }
  | { isValid: false; error: IDeckListParseError }

export type IDeckRuleViolationCode =
  | 'unknownCards'
  | 'leaderCount'
  | 'leaderCopies'
  | 'deckSize'
  | 'tooManyCopies'
  | 'bannedCard'
  | 'limitedCard'
  | 'notInCardPool'
  | 'colorMismatch'

export type IDeckRuleViolation = {
  code: IDeckRuleViolationCode
  messageKey: string
  params: Record<string, string | number>
}

export type IDeckRulesetEvaluation = {
  ruleset: IDeckRuleset
  isValid: boolean
  violations: IDeckRuleViolation[]
  leaderCopies: number
  nonLeaderCopies: number
}

export type IDeckRulesetValidation = {
  isLegalInAnyRuleset: boolean
  evaluations: IDeckRulesetEvaluation[]
}
