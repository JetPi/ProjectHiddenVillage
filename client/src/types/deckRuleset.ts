/** Whether a ruleset's rules restrict an otherwise open pool or define a closed one. */
export type IDeckRulesetCardPoolMode = 'Open' | 'AllowList'

/** What a rule compares against: the whole card code, or the set code before the first dash. */
export type IDeckRulesetCardRestrictionMatchType = 'Card' | 'Set'

/**
 * One card-pool rule. It names a code rather than a catalogue row, so a rule survives a catalogue edit and can
 * name a set whose cards do not exist yet. `maxCopies` of 0 bans the matched cards; in an allow-list ruleset a
 * value of at least 1 is what puts them in the pool.
 */
export type IDeckRulesetCardRestriction = {
  matchType: IDeckRulesetCardRestrictionMatchType
  code: string
  maxCopies: number
}

export type IDeckRuleset = {
  id: string
  key: string
  name: string
  isActive: boolean
  /** Open restricts nothing by default; AllowList denies every card no rule allows. */
  cardPoolMode: IDeckRulesetCardPoolMode
  /**
   * Whether quick match may pair players on this format. A host-only format stays fully playable through hosting,
   * invites and joins; it is simply never offered by the matchmaker.
   */
  availableInQuickMatch: boolean
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

/** A set code the catalogue holds, with how many cards carry it. */
export type IDeckRulesetSetCode = {
  code: string
  cardCount: number
}

export type ICreateDeckRulesetRequest = Omit<IDeckRuleset, 'id'>

export type IUpdateDeckRulesetRequest = Omit<IDeckRuleset, 'id' | 'key'>
