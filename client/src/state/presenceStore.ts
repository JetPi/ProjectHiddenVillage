import { create } from 'zustand'
import type { IPresenceSnapshot } from '@/types/presence'

type IPresenceStoreState = {
  snapshot: IPresenceSnapshot | null
  isConnected: boolean
  setSnapshot: (snapshot: IPresenceSnapshot) => void
  setConnected: (isConnected: boolean) => void
}

/**
 * The last snapshot the server published. It is intentionally a store rather than query state: the figure arrives
 * from a socket, and a stale snapshot is still worth showing when the connection drops.
 */
export const usePresenceStore = create<IPresenceStoreState>()((set) => ({
  snapshot: null,
  isConnected: false,
  setSnapshot: (snapshot) => set({ snapshot }),
  setConnected: (isConnected) => set({ isConnected }),
}))
