import { expect } from '@playwright/test'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { createGame, fetchGameState, joinGame, login, SEEDED_PLAYER_PROFILES, warmStartGame } from './api'
import { normalizeUserId } from './core'
import { closeHelperConnections } from './hub'
import type { AuthSession, MultiplayerPages, MultiplayerSeedProfileName, MultiplayerSetup } from './types'

const AUTH_STORAGE_KEY = 'phv-auth-session'

/**
 * Generated join codes are upper case by construction (`InMemoryGameInstanceRegistry.GameCodeAlphabet`).
 *
 * That is not cosmetic: the hub upper-cases every incoming game id (`GamesHub.NormalizeGameId`) while the
 * registry looks ids up ordinally, so a mixed-case code produces a game that cannot be addressed through
 * the hub at all. This assertion keeps the suite honest about that contract instead of retrying the
 * allocation until a playable code happens to appear (which used to mean ~9 wasted games per test).
 */
function isUppercaseGameCode(gameCode: string): boolean {
  return /^[A-Z0-9]{5}$/.test(gameCode)
}

/**
 * Opens the game route and waits for the board to mount.
 *
 * This used to reload the page up to eight times with a one-second sleep between attempts, because
 * the API could still be seeding. `globalSetup` now blocks until `/api/health` answers (the server
 * only starts listening once migrations and seeding are finished), so there is nothing transient
 * left to reload for: Playwright's own retrying assertion waits for the board, and a genuine
 * failure surfaces once instead of after eight reloads.
 */
async function openReadyGameView(page: Page, gameCode: string): Promise<void> {
  await page.goto(`/game/${gameCode}`)
  await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 30_000 })
}

/**
 * Per-player deck overrides.
 *
 * A spec that needs a deck composition the seed manifest cannot contain (because it would mean seeding a
 * fabricated card into every developer's catalogue) builds its own deck from runtime-minted fixture cards and
 * passes its id here; the other player keeps their seeded deck.
 */
export type MultiplayerDeckOverrides = {
  one?: { deckId: string }
  two?: { deckId: string }
}

export type MultiplayerSetupOptions = {
  /**
   * Walk the opening on the server and start in the first MainPhase (the default). Only a spec that asserts the
   * starting-player prompt or the mulligan itself passes `false`.
   */
  warmStart?: boolean
}

export async function setupMultiplayerGame(
  request: APIRequestContext,
  seedProfileName: MultiplayerSeedProfileName = 'default',
  deckOverrides: MultiplayerDeckOverrides = {},
  options: MultiplayerSetupOptions = {},
): Promise<MultiplayerSetup> {
  const seededPlayers = SEEDED_PLAYER_PROFILES[seedProfileName]

  const selectedPlayers = {
    one: deckOverrides.one
      ? { ...seededPlayers.one, deckId: deckOverrides.one.deckId }
      : seededPlayers.one,
    two: deckOverrides.two
      ? { ...seededPlayers.two, deckId: deckOverrides.two.deckId }
      : seededPlayers.two,
  }

  const [playerOneLogin, playerTwoLogin] = await Promise.all([
    login(request, selectedPlayers.one.email, selectedPlayers.one.password),
    login(request, selectedPlayers.two.email, selectedPlayers.two.password),
  ])

  const gameCode = await createGame(
    request,
    selectedPlayers.one.id,
    selectedPlayers.one.deckId,
    playerOneLogin.accessToken,
  )

  if (!isUppercaseGameCode(gameCode)) {
    throw new Error(
      `Game code '${gameCode}' is not upper-case, so hub-driven test actions cannot address it. `
      + 'InMemoryGameInstanceRegistry must only generate upper-case codes.',
    )
  }

  await joinGame(
    request,
    gameCode,
    selectedPlayers.two.id,
    selectedPlayers.two.deckId,
    playerTwoLogin.accessToken,
  )

  if (options.warmStart !== false) {
    // Starting player, both mulligans and the engine-owned phases, all before a page connects: with no watcher
    // registered the engine mints no phase presentation, so there is nothing to acknowledge.
    const warmed = await warmStartGame(request, gameCode)
    if (warmed.phase !== 'MainPhase') {
      throw new Error(`Warm start left game '${gameCode}' in ${warmed.phase}, expected MainPhase.`)
    }
  }

  return {
    gameCode,
    seedProfileName,
    playerOne: {
      userId: playerOneLogin.id,
      normalizedUserId: normalizeUserId(playerOneLogin.id),
      seedProfile: selectedPlayers.one,
      session: {
        userId: playerOneLogin.id,
        username: playerOneLogin.username,
        email: playerOneLogin.email,
        accessToken: playerOneLogin.accessToken,
        expiresAt: playerOneLogin.expiresAt,
      },
    },
    playerTwo: {
      userId: playerTwoLogin.id,
      normalizedUserId: normalizeUserId(playerTwoLogin.id),
      seedProfile: selectedPlayers.two,
      session: {
        userId: playerTwoLogin.id,
        username: playerTwoLogin.username,
        email: playerTwoLogin.email,
        accessToken: playerTwoLogin.accessToken,
        expiresAt: playerTwoLogin.expiresAt,
      },
    },
  }
}

async function createAuthenticatedGamePage(
  browser: Browser,
  session: AuthSession,
  gameCode: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      'X-Dev-User-Id': session.userId,
    },
  })

  await context.addInitScript(({ authStorageKey, authSession }) => {
    window.localStorage.setItem(authStorageKey, JSON.stringify(authSession))
  }, {
    authStorageKey: AUTH_STORAGE_KEY,
    authSession: session,
  })

  const page = await context.newPage()
  await openReadyGameView(page, gameCode)

  const sessionIsValid = await page.evaluate((authStorageKey) => {
    const rawSession = window.localStorage.getItem(authStorageKey)
    if (!rawSession) {
      return false
    }

    try {
      const parsed = JSON.parse(rawSession) as {
        userId?: string
        username?: string
        email?: string
        accessToken?: string
        expiresAt?: string
      }

      return Boolean(
        parsed.userId
        && parsed.username
        && parsed.email
        && parsed.accessToken
        && parsed.expiresAt,
      )
    } catch {
      return false
    }
  }, AUTH_STORAGE_KEY)

  expect(sessionIsValid).toBeTruthy()
  return { context, page }
}

export async function openMultiplayerPages(browser: Browser, setup: MultiplayerSetup): Promise<MultiplayerPages> {
  const [playerOneResources, playerTwoResources] = await Promise.all([
    createAuthenticatedGamePage(browser, setup.playerOne.session, setup.gameCode),
    createAuthenticatedGamePage(browser, setup.playerTwo.session, setup.gameCode),
  ])

  return {
    playerOneContext: playerOneResources.context,
    playerOnePage: playerOneResources.page,
    playerTwoContext: playerTwoResources.context,
    playerTwoPage: playerTwoResources.page,
  }
}

export async function closeMultiplayerPages(pages: MultiplayerPages): Promise<void> {
  await Promise.all([
    pages.playerOneContext.close(),
    pages.playerTwoContext.close(),
  ])

  // Every spec closes its pages in teardown, so this is the one place that bounds the lifetime of the
  // helper hub connections cached in `hub.ts` to a single test.
  await closeHelperConnections()
}

export async function waitUntilBothPlayersPresent(request: APIRequestContext, gameCode: string, accessToken: string): Promise<void> {
  await expect.poll(async () => {
    const state = await fetchGameState(request, gameCode, accessToken)
    return state.players.length
  }, {
    timeout: 20_000,
  }).toBe(2)
}
