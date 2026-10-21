
const flightEndsAtByKey = new Map<string, number>()

function noteFlight(key: string, endsAtMs: number): void {
  const existingEndsAt = flightEndsAtByKey.get(key)
  flightEndsAtByKey.set(key, existingEndsAt === undefined ? endsAtMs : Math.max(existingEndsAt, endsAtMs))
}

function pruneSettledFlights(nowMs: number): void {
  flightEndsAtByKey.forEach((endsAt, key) => {
    if (endsAt <= nowMs) {
      flightEndsAtByKey.delete(key)
    }
  })
}

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

function clearFlights(): void {
  flightEndsAtByKey.clear()
}

export { noteFlight, pruneSettledFlights, resolveFlightsSettleAtMs, whenIdle, clearFlights }
