/**
 * A wall-clock budget for helpers that repeatedly re-read the engine state.
 *
 * Those loops used to count attempts (`for (let cycle = 0; cycle < 180; cycle += 1)`), which conflates two
 * very different things: making progress, and waiting for the pages to acknowledge a phase presentation.
 * With the presentation gate closed, a cycle is a no-op - the engine is parked until the boards ack - so an
 * attempt budget can expire without the state ever having had a chance to offer the action being looked for.
 * Measured: at 3-4 Playwright workers a resolver intermittently ran out of its 180 cycles on a machine that
 * was merely busy, while the same scenario passed at one worker.
 *
 * A deadline gives every scenario the same wall-clock opportunity regardless of how fast an individual cycle
 * happens to run, and it makes the budget explicit instead of implied by (attempts x sleep).
 */
export type Deadline = {
  /** True once the budget has been consumed. Safe to call in a loop condition. */
  readonly expired: boolean
  readonly elapsedMs: number
  readonly budgetMs: number
}

export function createDeadline(budgetMs: number): Deadline {
  const startedAt = Date.now()

  return {
    get expired() {
      return Date.now() - startedAt >= budgetMs
    },
    get elapsedMs() {
      return Date.now() - startedAt
    },
    get budgetMs() {
      return budgetMs
    },
  }
}
