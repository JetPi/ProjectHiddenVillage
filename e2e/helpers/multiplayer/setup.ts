import { expect } from '@playwright/test'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { createGame, fetchGameState, joinGame, login, SEEDED_PLAYER_PROFILES } from './api'
import { normalizeUserId } from './core'
import type { AuthSession, MultiplayerPages, MultiplayerSeedProfileName, MultiplayerSetup } from './types'

const AUTH_STORAGE_KEY = 'phv-auth-session'

function isUppercaseGameCode(gameCode: string): boolean {
  return /^[A-Z0-9]{5}$/.test(gameCode)
}

async function openReadyGameView(page: Page, gameCode: string): Promise<void> {
  const maxAttempts = 8

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await page.goto(`/game/${gameCode}`)

    try {
      await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 5_000 })
      return
    } catch {
      // Route can transiently show error/loading while backend seed/runtime initializes.
    }

    await page.waitForTimeout(1000)
  }

  throw new Error('GameView route stayed in 400 Route Error state after retries.')
}

export async function setupMultiplayerGame(
  request: APIRequestContext,
  seedProfileName: MultiplayerSeedProfileName = 'default',
): Promise<MultiplayerSetup> {
  const selectedPlayers = SEEDED_PLAYER_PROFILES[seedProfileName]

  const [playerOneLogin, playerTwoLogin] = await Promise.all([
    login(request, selectedPlayers.one.email, selectedPlayers.one.password),
    login(request, selectedPlayers.two.email, selectedPlayers.two.password),
  ])

  let gameCode = ''

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const candidateCode = await createGame(
      request,
      selectedPlayers.one.id,
      selectedPlayers.one.deckId,
      playerOneLogin.accessToken,
    )

    if (!isUppercaseGameCode(candidateCode)) {
      continue
    }

    await joinGame(
      request,
      candidateCode,
      selectedPlayers.two.id,
      selectedPlayers.two.deckId,
      playerTwoLogin.accessToken,
    )

    gameCode = candidateCode
    break
  }

  if (!gameCode) {
    throw new Error('Failed to allocate an uppercase-only game code for hub-driven test actions.')
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
}

export async function waitUntilBothPlayersPresent(request: APIRequestContext, gameCode: string, accessToken: string): Promise<void> {
  await expect.poll(async () => {
    const state = await fetchGameState(request, gameCode, accessToken)
    return state.players.length
  }, {
    timeout: 20_000,
  }).toBe(2)
}
