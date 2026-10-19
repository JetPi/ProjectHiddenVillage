import { request } from '@playwright/test'
import { reapFixtureCards, reapFixtureDecks } from './helpers/multiplayer/fixtures'

/**
 * Deletes the synthetic catalogue cards the multiplayer specs mint (`E2E-POWER-10`, `E2E-RECALL-NARUTO`,
 * `E2E-RUSH-10`) once every worker has finished.
 *
 * This is deliberately suite-scoped rather than a per-file `afterAll`: a file-level delete races a concurrent run
 * of the same file (`--repeat-each` with more than one worker) and can pull the card out from under the other
 * worker's scenario, which is why the battle-visuals spec used to leave its fixture behind. Playwright runs
 * global teardown after all workers have exited but before the `webServer` plugin stops the API, so the delete
 * endpoint is still reachable here.
 *
 * Best effort by design: reporting a failure must never turn a green run red, and a run killed before this hook
 * is reached is cleaned by the sweep in `globalSetup` on the next start.
 */
export default async function globalTeardown(): Promise<void> {
  const context = await request.newContext()

  try {
    const failures = [...await reapFixtureCards(context), ...await reapFixtureDecks(context)]
    if (failures.length > 0) {
      console.warn(
        `[global-teardown] fixtures could not be deleted; the next run's startup sweep will retry:\n  ${failures.join('\n  ')}`,
      )
    }
  } finally {
    await context.dispose()
  }
}
