import { request } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { API_BASE_URL } from './helpers/multiplayer/api'
import { reapFixtureCards, reapFixtureDecks } from './helpers/multiplayer/fixtures'

const HEALTH_URL = `${API_BASE_URL}/api/health`
const READY_DEADLINE_MS = 120_000
const POLL_INTERVAL_MS = 500

/**
 * Blocks the whole run until the API is actually serving, then clears fixture cards a previous run left behind.
 *
 * `webServer.url` only proves that the client (dev or preview server) answers on 4173; the dotnet API comes
 * up behind it and does not start listening until its migrations and development seeding have finished.
 * Specs used to absorb that window with retry-with-sleep loops in `login`, the fixture-card setup and the
 * game-view opener. Gating on `/api/health` removes the need for all of them, and turns "the API never came
 * up" into a single clear failure instead of dozens of slow, confusing ones.
 *
 * The sweep matters because global teardown never runs for a run that was killed or crashed: without it, the
 * fabricated cards from that run would survive into the next one. It runs only once the API is answering, so it
 * cannot race the server's own startup.
 */
export default async function globalSetup(): Promise<void> {
  const context = await request.newContext()
  const deadline = Date.now() + READY_DEADLINE_MS
  let lastFailure = 'no attempt was made'

  try {
    for (;;) {
      try {
        const response = await context.get(HEALTH_URL, { timeout: 5_000 })
        if (response.ok()) {
          break
        }

        lastFailure = `HTTP ${response.status()}`
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error)
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `The API never became ready at ${HEALTH_URL} within ${READY_DEADLINE_MS} ms. Last attempt: ${lastFailure}`,
        )
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    await reapLeftoverFixtures(context)
  } finally {
    await context.dispose()
  }
}

/**
 * Removes fixture cards minted by a run that never reached global teardown.
 *
 * Best effort: a failure here is reported and then ignored, because a leftover card is untidy but never a reason
 * to stop the suite. The specs create or reset the fixtures they need anyway; this only keeps the catalogue from
 * carrying fabricated rows between runs.
 */
async function reapLeftoverFixtures(context: APIRequestContext): Promise<void> {
  const failures = [...await reapFixtureCards(context), ...await reapFixtureDecks(context)]
  if (failures.length > 0) {
    console.warn(`[global-setup] fixtures left by a previous run could not be deleted:\n  ${failures.join('\n  ')}`)
  }
}
