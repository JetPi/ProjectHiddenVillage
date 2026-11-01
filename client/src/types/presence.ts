export type IWaitingPlayersByRuleset = {
  rulesetId: string
  rulesetName: string
  waitingCount: number
}

/**
 * The payload published by both `GET /api/presence` and the `PresenceUpdated` hub event: everyone with the site
 * open right now (in a game or not) plus how deep each matchmaking queue is.
 */
export type IPresenceSnapshot = {
  onlineViewers: number
  waitingByRuleset: IWaitingPlayersByRuleset[]
  authenticatedViewers: number
  anonymousViewers: number
  maintenanceEnabled?: boolean
  maintenanceMessage?: string | null
  activeGames?: number
}
