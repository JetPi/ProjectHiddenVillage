export type IDeckRulesetCardRestriction = {
  cardId: string
  maxCopies: number
}

export type IDeckRuleset = {
  id: string
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
  cardRestrictions: IDeckRulesetCardRestriction[]
}

export type ICreateDeckRulesetRequest = Omit<IDeckRuleset, 'id'>

export type IUpdateDeckRulesetRequest = Omit<IDeckRuleset, 'id' | 'key'>
