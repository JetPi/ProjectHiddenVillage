import { defineConfig, devices } from '@playwright/test'

const isCi = Boolean(process.env.CI)
// Deliberately one worker per CI machine, unchanged from before: CI speed now comes from sharding
// (three independent runners, see .github/workflows/e2e.yml), which multiplies throughput without
// raising the per-machine concurrency these scenarios were tuned against. The helper retry budgets in
// e2e/helpers/multiplayer/flow.ts are iteration-based, and running several heavy scenarios against one
// in-memory engine pushed them past their budget on a loaded machine (measured: one failure per 94
// runs at 3-4 workers, a different test each time). Raising this is a follow-up that must first make
// those budgets deadline-based.
const CI_WORKERS = 1

export default defineConfig({
  testDir: './e2e',
  // Blocks until the API answers /api/health, which it only does once migrations and seeding are finished.
  // That removes the warm-up retry loops the specs used to carry (see e2e/global-setup.ts).
  globalSetup: './e2e/global-setup.ts',
  // File-level parallelism only, deliberately. Tests within a file are not mutually isolated: a spec's
  // `beforeAll`/`afterAll` owns a catalogue-level fixture lifecycle (see `ensureFixtureCards` in
  // gameview.multiplayer.actions.spec.ts) and two workers running tests from that file concurrently race
  // the create/delete against each other - measured as Gamabunta summons resolving against a catalogue
  // whose fixture cards had just been removed. Files themselves share nothing, so `workers` still scales
  // the suite across files.
  fullyParallel: false,
  retries: isCi ? 1 : 0,
  workers: isCi ? CI_WORKERS : undefined,
  reporter: isCi ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // The board's motion is part of what is under test (the attack lunge and the flight assertions), and a
    // board that honours the OS "reduce motion" setting deliberately animates nothing. Pin the preference so
    // the suite is deterministic and those assertions stay meaningful.
    reducedMotion: 'no-preference',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Video was encoded for every test and discarded whenever the test passed, while the trace already
    // carries everything a failure needs. Recording it bought nothing but wall time.
    video: 'off',
  },
  webServer: {
    command: 'npm run e2e:start',
    url: 'http://127.0.0.1:4173',
    // Reuse a stack that is already running locally; CI always starts from a clean one.
    reuseExistingServer: !isCi,
    timeout: 180_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
