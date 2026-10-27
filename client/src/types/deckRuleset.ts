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
  /** Whether games created under this ruleset run the action clock at all. */
  clockEnabled: boolean
  /** Seconds a player gets for one main-phase stop. */
  mainPhaseSeconds: number
  /** Seconds a player gets for any other interactive stop. */
  otherPhaseSeconds: number
  /** The player's whole-game time pool, in seconds. Running out of it loses the game. */
  playerPoolSeconds: number
  /** Consecutive timeouts that forfeit the game to the opponent. */
  timeoutsBeforeForfeit: number
}

export type ICreateDeckRulesetRequest = Omit<IDeckRuleset, 'id'>

export type IUpdateDeckRulesetRequest = Omit<IDeckRuleset, 'id' | 'key'>
