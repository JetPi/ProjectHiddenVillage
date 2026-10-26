export type IMatchTicketState = 'waiting' | 'matched' | 'cancelled' | 'expired'

export type IMatchTicket = {
  ticketId: string
  rulesetId: string
  rulesetName: string
  state: IMatchTicketState
  gameId: string | null
  opponentName: string | null
  enqueuedAtUtc: string
}

export type IEnqueueMatchRequest = {
  userId: string
  deckId: string
  rulesetId: string
}
