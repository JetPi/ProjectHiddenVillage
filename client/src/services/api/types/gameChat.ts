/** Mirrors GameChat:MaxTextLength on the server; the composer uses it as a hint, the server enforces it. */
export const GAME_CHAT_MAX_TEXT_LENGTH = 500

export type IGameChatMessage = {
  sequence: number
  messageId: string
  senderPlayerId: string
  sentAtUtc: string
  text: string
}

export type IGameChatHistoryResponse = {
  gameId: string
  latestSequence: number
  messages: IGameChatMessage[]
}

/** The event carries the whole message, so a client appends it instead of refetching anything. */
export type IGameChatMessagePostedHandler = (gameId: string, message: IGameChatMessage) => void
