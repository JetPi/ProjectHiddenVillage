import { useEffect, useState } from 'react'

/**
 * Whether the other seat is on this board right now.
 *
 * The server is the authority: `null` means the opponent is watching - or that presence is not observed at all, which
 * is treated the same way - and a number is how much of the grace that keeps a refresh from looking like a departure
 * is left. The countdown itself is local and re-syncs on the next state read, exactly like the action clock's
 * deadline, so both the board's status dot and the rematch offer follow it without polling anything.
 */
function useOpponentPresence(secondsRemaining: number | null | undefined): boolean {
  const seconds = secondsRemaining ?? null
  // What ran out, not a plain boolean: a later state read carries a different remainder, so the countdown restarts
  // on its own without the effect having to reset anything.
  const [expiredSeconds, setExpiredSeconds] = useState<number | null>(null)

  useEffect(() => {
    if (seconds === null || seconds <= 0) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setExpiredSeconds(seconds)
    }, seconds * 1000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [seconds])

  if (seconds === null) {
    return true
  }

  return seconds > 0 && expiredSeconds !== seconds
}

export { useOpponentPresence }
