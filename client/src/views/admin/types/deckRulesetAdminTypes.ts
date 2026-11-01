import type {
  IDeckRulesetCardPoolMode,
  IDeckRulesetCardRestrictionMatchType,
} from '@/types/deckRuleset'

/**
 * One rule being edited. `matchType` decides what `code` is compared against: the whole card code or the set code
 * before the first dash. `maxCopies` of 0 bans the match; in an allow-list ruleset a value of at least 1 is what
 * puts the match in the pool.
 */
export type IDeckRulesetRestrictionDraft = {
  matchType: IDeckRulesetCardRestrictionMatchType
  code: string
  maxCopies: number
}

export type IDeckRulesetDraft = {
  key: string
  name: string
  isActive: boolean
  cardPoolMode: IDeckRulesetCardPoolMode
  availableInQuickMatch: boolean
  leaderCount: number
  nonLeaderCardCount: number
  maxCopiesPerNonLeaderCard: number
  requireLeaderColorMatch: boolean
  allowChakraCards: boolean
  allowSummonCards: boolean
  sortOrder: number
  clockEnabled: boolean
  mainPhaseSeconds: number
  otherPhaseSeconds: number
  playerPoolSeconds: number
  timeoutsBeforeForfeit: number
  restrictions: IDeckRulesetRestrictionDraft[]
}

export type IDeckRulesetValidationViolation = {
  messageKey: string
  params?: Record<string, string | number>
}
