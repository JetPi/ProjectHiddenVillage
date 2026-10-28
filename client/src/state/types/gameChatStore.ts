import type { IGameChatMessage } from '@/services/api/types/gameChat'

export type IGameChatStoreState = {
  gameId: string | null
  messages: IGameChatMessage[]
  /** The highest sequence this client has, which is what it asks the server to catch it up from. */
  lastKnownSequence: number
  isSending: boolean
  error: string | null
  unreadCount: number
  initializeChatSession: (gameId: string) => void
  appendMessage: (message: IGameChatMessage, countAsUnread: boolean) => void
  applyHistory: (messages: IGameChatMessage[], latestSequence: number, countAsUnread: boolean) => void
  setSending: (value: boolean) => void
  setError: (value: string | null) => void
  clearUnread: () => void
}
