/**
 * The rematch table a player has already agreed to, carried across the trip back to the login view.
 *
 * The table is reserved server side and legitimate for both players; this only remembers its code so the join form
 * can arrive with the code filled in. It is session storage on purpose: the reservation lapses in minutes, and a
 * stale code surviving a browser restart would be worse than the reload it saves.
 */
export type IPendingRematch = {
  // The reserved table code. Reserved for the two players of the finished match, bound to the same format.
  code: string
  // The format the reserved table plays, for the banner. null for an unbound table.
  rulesetName: string | null
}

const STORAGE_KEY = 'phv.pendingRematch'

function readStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function storePendingRematch(rematch: IPendingRematch): void {
  const code = rematch.code.trim().toUpperCase()

  if (!code) {
    return
  }

  readStorage()?.setItem(
    STORAGE_KEY,
    JSON.stringify({ code, rulesetName: rematch.rulesetName ?? null } satisfies IPendingRematch),
  )
}

export function readPendingRematch(): IPendingRematch | null {
  const raw = readStorage()?.getItem(STORAGE_KEY)

  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<IPendingRematch>

    if (typeof parsed.code !== 'string' || !parsed.code.trim()) {
      return null
    }

    return {
      code: parsed.code.trim().toUpperCase(),
      rulesetName: typeof parsed.rulesetName === 'string' ? parsed.rulesetName : null,
    }
  } catch {
    return null
  }
}

export function clearPendingRematch(): void {
  readStorage()?.removeItem(STORAGE_KEY)
}
