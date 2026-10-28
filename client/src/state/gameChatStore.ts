import { create } from 'zustand'
import type { IGameChatMessage } from '@/services/api/types/gameChat'
import type { IGameChatStoreState } from '@/state/types/gameChatStore'

const MAX_RENDERED_MESSAGES = 200

const initialState = {
  gameId: null as string | null,
  messages: [] as IGameChatMessage[],
  lastKnownSequence: 0,
  isSending: false,
  error: null as string | null,
  unreadCount: 0,
}

function mergeMessages(current: IGameChatMessage[], incoming: IGameChatMessage[]): IGameChatMessage[] {
  const seen = new Set(current.map((message) => message.messageId))
  const merged = [...current]

  for (const message of incoming) {
    if (seen.has(message.messageId)) {
      continue
    }

    seen.add(message.messageId)
    merged.push(message)
  }

  return merged
    .sort((left, right) => left.sequence - right.sequence)
    .slice(-MAX_RENDERED_MESSAGES)
}

export const useGameChatStore = create<IGameChatStoreState>()((set) => ({
  ...initialState,
  initializeChatSession: (gameId) =>
    set((state) => (state.gameId === gameId ? state : { ...initialState, gameId })),
  // The same message can arrive twice: once from the poster's own echo and once from a catch-up read.
  appendMessage: (message, countAsUnread) =>
    set((state) => {
      if (state.messages.some((existing) => existing.messageId === message.messageId)) {
        return state
      }

      return {
        messages: mergeMessages(state.messages, [message]),
        lastKnownSequence: Math.max(state.lastKnownSequence, message.sequence),
        unreadCount: countAsUnread ? state.unreadCount + 1 : state.unreadCount,
        error: null,
      }
    }),
  applyHistory: (messages, latestSequence, countAsUnread) =>
    set((state) => {
      const unseenCount = messages.filter((message) => message.sequence > state.lastKnownSequence).length

      return {
        messages: mergeMessages(state.messages, messages),
        lastKnownSequence: Math.max(state.lastKnownSequence, latestSequence),
        unreadCount: countAsUnread ? state.unreadCount + unseenCount : state.unreadCount,
      }
    }),
  setSending: (value) => set({ isSending: value }),
  setError: (value) => set({ error: value }),
  clearUnread: () => set({ unreadCount: 0 }),
}))
