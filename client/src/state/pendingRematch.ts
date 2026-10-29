/**
 * The rematch table a player has already agreed to, carried across the trip back to the login view.
 *
 * The table is reserved server side and legitimate for both players; this only remembers its code so the join form
 * can arrive with the code filled in. It is session storage on purpose: the reservation lapses within the half hour,
 * and a stale code surviving a browser restart would be worse than the reload it saves.
 *
 * The record carries the reservation's expiry, so a tab the browser restores tomorrow cannot show a rematch for a
 * game that ended yesterday. The server stays the authority - the login view probes the reservation - but a record
 * that can be seen to be dead never reaches the screen.
 */
export type IPendingRematch = {
  // The reserved table code. Reserved for the two players of the finished match, bound to the same format.
  code: string
  // The format the reserved table plays, for the banner. null for an unbound table.
  rulesetName: string | null
  // When the reservation lapses, as the server published it. null when the record predates the field.
  expiresAtUtc: string | null
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

function isExpired(expiresAtUtc: string | null): boolean {
  if (!expiresAtUtc) {
    return false
  }

  const expiresAt = Date.parse(expiresAtUtc)

  return Number.isFinite(expiresAt) && expiresAt <= Date.now()
}

export function storePendingRematch(rematch: IPendingRematch): void {
  const code = rematch.code.trim().toUpperCase()

  if (!code) {
    return
  }

  readStorage()?.setItem(
    STORAGE_KEY,
    JSON.stringify({
      code,
      rulesetName: rematch.rulesetName ?? null,
      expiresAtUtc: rematch.expiresAtUtc ?? null,
    } satisfies IPendingRematch),
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

    const expiresAtUtc = typeof parsed.expiresAtUtc === 'string' ? parsed.expiresAtUtc : null

    // A lapsed record is not a rematch: drop it here rather than showing a banner the player cannot act on.
    if (isExpired(expiresAtUtc)) {
      clearPendingRematch()
      return null
    }

    return {
      code: parsed.code.trim().toUpperCase(),
      rulesetName: typeof parsed.rulesetName === 'string' ? parsed.rulesetName : null,
      expiresAtUtc,
    }
  } catch {
    return null
  }
}

export function clearPendingRematch(): void {
  readStorage()?.removeItem(STORAGE_KEY)
}
