import { usePresenceStore } from '@/state/presenceStore'
import type { IPresenceSnapshot } from '@/types/presence'

/** The last published snapshot, or null before the first one arrives. */
export function usePresenceSnapshot(): IPresenceSnapshot | null {
  return usePresenceStore((state) => state.snapshot)
}

/** Whether the live channel is up. The snapshot is still shown when it is not. */
export function usePresenceConnected(): boolean {
  return usePresenceStore((state) => state.isConnected)
}

/**
 * How many players are waiting in one format. Null while the snapshot is unknown, so callers can fall back to
 * copy that does not quote a number; zero means "nobody yet", which is worth saying.
 */
export function useRulesetWaitingCount(rulesetId: string | null): number | null {
  const snapshot = usePresenceStore((state) => state.snapshot)

  if (!snapshot || !rulesetId) {
    return null
  }

  return snapshot.waitingByRuleset.find((entry) => entry.rulesetId === rulesetId)?.waitingCount ?? 0
}
