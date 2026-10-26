import { create } from 'zustand'

export type TAuthNoticeKind = 'signedIn' | 'signedUp'

export type IAuthNotice = {
  id: number
  kind: TAuthNoticeKind
  username: string
}

type IAuthNoticeStoreState = {
  notices: IAuthNotice[]
  publish: (kind: TAuthNoticeKind, username: string) => void
  drain: () => IAuthNotice[]
}

let nextNoticeId = 0

/**
 * Notices exist only for the moment a registered session is acquired. They are deliberately memory-only: a
 * reload starts with an empty queue, which is what stops a restored session from being announced as a new
 * login. Guests never publish here - they did not log in, and the action that minted them already toasts.
 *
 * The queue is drained atomically so a React StrictMode double effect consumes each notice exactly once.
 */
export const useAuthNoticeStore = create<IAuthNoticeStoreState>()((set, get) => ({
  notices: [],
  publish: (kind, username) => {
    const trimmedUsername = username.trim()
    if (!trimmedUsername) {
      return
    }

    nextNoticeId += 1
    set((state) => ({
      notices: [...state.notices, { id: nextNoticeId, kind, username: trimmedUsername }],
    }))
  },
  drain: () => {
    const drained = get().notices

    if (drained.length > 0) {
      set({ notices: [] })
    }

    return drained
  },
}))

/** For route actions, which run outside React and therefore cannot use the hook. */
export function publishAuthNotice(kind: TAuthNoticeKind, username: string): void {
  useAuthNoticeStore.getState().publish(kind, username)
}
