/**
 * The board's single animation director.
 *
 * It owns the one question the game protocol actually depends on: *is anything still animating?* The
 * phase-presentation acknowledgement reads only this, so a new kind of animation cannot forget to register and
 * the engine can never resume while a card is still in the air.
 *
 * Policy lives here; the mechanism stays with the callers (WAAPI overlay copies today, Motion next). Deadlines
 * are keyed, so re-scheduling an animation extends its own wait instead of resetting or stacking it.
 */

const flightEndsAtByKey = new Map<string, number>()

/**
 * Registers a flight the acknowledgement has to wait for. Re-scheduling the same key only ever pushes its
 * deadline out: a later short flight must not shorten the wait for a longer one already in the air.
 */
function noteFlight(key: string, endsAtMs: number): void {
  const existingEndsAt = flightEndsAtByKey.get(key)
  flightEndsAtByKey.set(key, existingEndsAt === undefined ? endsAtMs : Math.max(existingEndsAt, endsAtMs))
}

/** Drops the deadlines that have already passed, so the registry cannot grow without bound. */
function pruneSettledFlights(nowMs: number): void {
  flightEndsAtByKey.forEach((endsAt, key) => {
    if (endsAt <= nowMs) {
      flightEndsAtByKey.delete(key)
    }
  })
}

/**
 * The moment every registered flight has finished, or null when nothing is in flight. The synchronous form of
 * `whenIdle`, for callers that schedule rather than await.
 */
function resolveFlightsSettleAtMs(nowMs: number): number | null {
  let settleAt: number | null = null

  flightEndsAtByKey.forEach((endsAt) => {
    if (endsAt <= nowMs) {
      return
    }

    settleAt = settleAt === null ? endsAt : Math.max(settleAt, endsAt)
  })

  return settleAt
}

/**
 * Resolves as soon as no flight is outstanding - immediately when the board is already idle. The value is
 * re-resolved at await time, so a flight registered while an earlier one is still in the air is included.
 */
function whenIdle(): Promise<void> {
  const nowMs = Date.now()
  const settleAtMs = resolveFlightsSettleAtMs(nowMs)
  if (settleAtMs === null) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, settleAtMs - nowMs)
  })
}

/** Forgets every deadline: used when the board is torn down, so a remount starts from a clean registry. */
function clearFlights(): void {
  flightEndsAtByKey.clear()
}

export { noteFlight, pruneSettledFlights, resolveFlightsSettleAtMs, whenIdle, clearFlights }
