export type IDeckRulesetRestrictionDraft = {
  cardId: string
  maxCopies: number
}

export type IDeckRulesetDraft = {
  key: string
  name: string
  isActive: boolean
  leaderCount: number
  nonLeaderCardCount: number
  maxCopiesPerNonLeaderCard: number
  requireLeaderColorMatch: boolean
  allowChakraCards: boolean
  allowSummonCards: boolean
  sortOrder: number
  restrictions: IDeckRulesetRestrictionDraft[]
}

export type IDeckRulesetValidationViolation = {
  messageKey: string
  params?: Record<string, string | number>
}
