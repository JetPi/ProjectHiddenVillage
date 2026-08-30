import { expect, test } from '@playwright/test'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

const API_BASE_URL = 'http://127.0.0.1:3001'
const AUTH_STORAGE_KEY = 'phv-auth-session'

const SEEDED_PLAYER_ONE = {
  id: '20000000-0000-0000-0000-000000000001',
  email: 'test-user-1@hiddenvillage.local',
  password: 'TestUser1!',
  deckId: '10000000-0000-0000-0000-000000000001',
}

const SEEDED_PLAYER_TWO = {
  id: '20000000-0000-0000-0000-000000000002',
  email: 'test-user-2@hiddenvillage.local',
  password: 'TestUser2!',
  deckId: '10000000-0000-0000-0000-000000000002',
}

type LoginResponse = {
  id: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
}

type AuthSession = {
  userId: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
}

type PromptResponse = {
  type: string
  isAwaitingRequestingPlayer: boolean
  options: string[]
}

type GameActionOptionResponse = {
  actionId: string
  label: string
  isEnabled: boolean
}

type GamePlayerStateResponse = {
  leader: {
    displayName: string
  }
}

type GameStateResponse = {
  gameId: string
  activePlayerId: string
  phase: string
  pendingPrompt: PromptResponse | null
  availableActions: GameActionOptionResponse[]
  players: GamePlayerStateResponse[]
}

type PlayerAuth = {
  userId: string
  normalizedUserId: string
  session: AuthSession
}

type MultiplayerSetup = {
  gameCode: string
  playerOne: PlayerAuth
  playerTwo: PlayerAuth
}

type MultiplayerPages = {
  playerOneContext: BrowserContext
  playerOnePage: Page
  playerTwoContext: BrowserContext
  playerTwoPage: Page
}

function normalizeUserId(userId: string): string {
  return userId.trim().toLowerCase().replace(/-/g, '')
}

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

async function login(request: APIRequestContext, email: string, password: string): Promise<LoginResponse> {
  const maxAttempts = 20

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await request.post(`${API_BASE_URL}/api/user/login`, {
        data: {
          email,
          password,
        },
      })

      if (response.ok()) {
        return await response.json() as LoginResponse
      }
    } catch {
      // Backend can still be warming up when this test starts.
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error(`Failed to login seeded user '${email}' after retries.`)
}

async function createGame(request: APIRequestContext, userId: string, deckId: string, accessToken: string): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/games`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      userId,
      deckId,
    },
  })

  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { id: string }
  return payload.id
}

async function joinGame(
  request: APIRequestContext,
  gameCode: string,
  userId: string,
  deckId: string,
  accessToken: string,
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/api/games/${encodeURIComponent(gameCode)}/join`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    data: {
      userId,
      deckId,
    },
  })

  expect(response.ok()).toBeTruthy()
}

async function fetchGameState(request: APIRequestContext, gameCode: string, accessToken: string): Promise<GameStateResponse> {
  const response = await request.get(`${API_BASE_URL}/api/games/${encodeURIComponent(gameCode)}/state`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  expect(response.ok()).toBeTruthy()
  return await response.json() as GameStateResponse
}

function buildHubConnection(accessToken: string, userId: string) {
  const connection = new HubConnectionBuilder()
    .withUrl(`${API_BASE_URL}/hubs/games`, {
      accessTokenFactory: () => accessToken,
      headers: {
        'X-Dev-User-Id': userId,
      },
      withCredentials: false,
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()

  // These helper connections invoke hub mutations but do not otherwise subscribe
  // to gameplay updates; attach no-op handlers to avoid unhandled method warnings.
  connection.on('GameStateInvalidated', () => {})
  connection.on('GameParticipantJoined', () => {})

  return connection
}

async function resolvePromptViaHub(
  gameCode: string,
  player: PlayerAuth,
  selectedOption: string,
): Promise<void> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>(
      'ResolvePrompt',
      gameCode.toUpperCase(),
      {
        requestedPlayerId: player.normalizedUserId,
        selectedOption,
      },
    )

    expect(result.succeeded, `${result.errorCode ?? 'Hub.ResolvePrompt'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()
  } finally {
    await connection.stop()
  }
}

async function advancePhaseViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>('AdvancePhase', gameCode.toUpperCase())

    expect(result.succeeded, `${result.errorCode ?? 'Hub.AdvancePhase'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()
  } finally {
    await connection.stop()
  }
}

async function setupMultiplayerGame(request: APIRequestContext): Promise<MultiplayerSetup> {
  const [playerOneLogin, playerTwoLogin] = await Promise.all([
    login(request, SEEDED_PLAYER_ONE.email, SEEDED_PLAYER_ONE.password),
    login(request, SEEDED_PLAYER_TWO.email, SEEDED_PLAYER_TWO.password),
  ])

  let gameCode = ''

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidateCode = await createGame(
      request,
      SEEDED_PLAYER_ONE.id,
      SEEDED_PLAYER_ONE.deckId,
      playerOneLogin.accessToken,
    )

    if (!isUppercaseGameCode(candidateCode)) {
      continue
    }

    await joinGame(
      request,
      candidateCode,
      SEEDED_PLAYER_TWO.id,
      SEEDED_PLAYER_TWO.deckId,
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
    playerOne: {
      userId: playerOneLogin.id,
      normalizedUserId: normalizeUserId(playerOneLogin.id),
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

async function openMultiplayerPages(browser: Browser, setup: MultiplayerSetup): Promise<MultiplayerPages> {
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

async function closeMultiplayerPages(pages: MultiplayerPages): Promise<void> {
  await Promise.all([
    pages.playerOneContext.close(),
    pages.playerTwoContext.close(),
  ])
}

async function waitUntilBothPlayersPresent(request: APIRequestContext, gameCode: string, accessToken: string): Promise<void> {
  await expect.poll(async () => {
    const state = await fetchGameState(request, gameCode, accessToken)
    return state.players.length
  }, {
    timeout: 20_000,
  }).toBe(2)
}

async function getPromptOwnerByType(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  promptType: 'ChooseStartingPlayer' | 'Mulligan',
): Promise<'playerOne' | 'playerTwo' | 'none'> {
  const [playerOneState, playerTwoState] = await Promise.all([
    fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
    fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
  ])

  const playerOneOwnsPrompt =
    playerOneState.pendingPrompt?.type === promptType
    && playerOneState.pendingPrompt.isAwaitingRequestingPlayer
  const playerTwoOwnsPrompt =
    playerTwoState.pendingPrompt?.type === promptType
    && playerTwoState.pendingPrompt.isAwaitingRequestingPlayer

  if (playerOneOwnsPrompt && !playerTwoOwnsPrompt) {
    return 'playerOne'
  }

  if (!playerOneOwnsPrompt && playerTwoOwnsPrompt) {
    return 'playerTwo'
  }

  return 'none'
}

async function resolveStartingPromptOwner(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<'playerOne' | 'playerTwo'> {
  await expect.poll(async () => {
    return await getPromptOwnerByType(request, setup, 'ChooseStartingPlayer')
  }, {
    timeout: 20_000,
  }).not.toBe('none')

  const owner = await getPromptOwnerByType(request, setup, 'ChooseStartingPlayer')
  return owner === 'playerTwo' ? 'playerTwo' : 'playerOne'
}

async function waitUntilMulliganPromptOwner(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<'playerOne' | 'playerTwo'> {
  await expect.poll(async () => {
    return await getPromptOwnerByType(request, setup, 'Mulligan')
  }, {
    timeout: 20_000,
  }).not.toBe('none')

  const owner = await getPromptOwnerByType(request, setup, 'Mulligan')
  return owner === 'playerTwo' ? 'playerTwo' : 'playerOne'
}

async function advanceToMulliganPromptIfNeeded(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<void> {
  const maxAdvances = 6

  for (let attempt = 0; attempt < maxAdvances; attempt += 1) {
    const mulliganOwner = await getPromptOwnerByType(request, setup, 'Mulligan')
    if (mulliganOwner !== 'none') {
      return
    }

    const playerOneState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    const activePlayer = normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
      ? setup.playerOne
      : setup.playerTwo
    const canAdvance = playerOneState.availableActions.some((action) => action.actionId === 'advance-phase' && action.isEnabled)

    if (!canAdvance) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      continue
    }

    await advancePhaseViaHub(setup.gameCode, activePlayer)
  }

  throw new Error('Failed to reach Mulligan prompt after advancing phases.')
}

test.describe('GameView multiplayer game-start flow', () => {
  test.describe.configure({ timeout: 120_000 })

  test('loads leader cards when both players are present in a game instance', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      await waitUntilBothPlayersPresent(request, setup.gameCode, setup.playerOne.session.accessToken)

      await expect(pages.playerOnePage.getByTestId('game-board')).toBeVisible()
      await expect(pages.playerTwoPage.getByTestId('game-board')).toBeVisible()

      await expect(pages.playerOnePage.getByText('Leader', { exact: true })).toHaveCount(0)
      await expect(pages.playerTwoPage.getByText('Leader', { exact: true })).toHaveCount(0)

      await expect(pages.playerOnePage.getByRole('button', { name: 'Open leader card details' })).toHaveCount(2)
      await expect(pages.playerTwoPage.getByRole('button', { name: 'Open leader card details' })).toHaveCount(2)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('assigns one player the starting-player prompt and reflects the selected decision', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const promptOwner = await resolveStartingPromptOwner(request, setup)
      const ownerPage = promptOwner === 'playerOne' ? pages.playerOnePage : pages.playerTwoPage
      const nonOwnerPage = promptOwner === 'playerOne' ? pages.playerTwoPage : pages.playerOnePage
      const owner = promptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo

      await expect(ownerPage.getByTestId('prompt-overlay')).toBeVisible()
      await expect(ownerPage.getByTestId('prompt-option-goFirst')).toBeVisible()
      await expect(ownerPage.getByTestId('prompt-option-goSecond')).toBeVisible()
      await expect(ownerPage.getByTestId('prompt-option-goFirst')).toBeEnabled()
      await expect(nonOwnerPage.getByTestId('prompt-overlay')).toHaveCount(0)
      await expect(nonOwnerPage.getByTestId('phase-indicator')).toContainText('Waiting for opponent to choose')

      await resolvePromptViaHub(setup.gameCode, owner, 'goFirst')

      await expect(ownerPage.getByTestId('prompt-overlay')).toHaveCount(0)

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, owner.session.accessToken)
        return normalizeUserId(state.activePlayerId) === owner.normalizedUserId
          && state.pendingPrompt?.type !== 'ChooseStartingPlayer'
      }, {
        timeout: 20_000,
      }).toBe(true)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('prompts the player going second for mulligan and handles Keep Hand', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)

      const mulliganPromptOwner = await waitUntilMulliganPromptOwner(request, setup)
      const mulliganOwnerPage = mulliganPromptOwner === 'playerOne' ? pages.playerOnePage : pages.playerTwoPage
      const nonOwnerPage = mulliganPromptOwner === 'playerOne' ? pages.playerTwoPage : pages.playerOnePage
      const mulliganOwner = mulliganPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      const nonMulliganOwner = mulliganPromptOwner === 'playerOne' ? setup.playerTwo : setup.playerOne

      const ownerState = await fetchGameState(request, setup.gameCode, mulliganOwner.session.accessToken)
      const nonOwnerState = await fetchGameState(request, setup.gameCode, nonMulliganOwner.session.accessToken)

      expect(normalizeUserId(ownerState.activePlayerId)).toBe(nonMulliganOwner.normalizedUserId)
      expect(normalizeUserId(nonOwnerState.activePlayerId)).toBe(nonMulliganOwner.normalizedUserId)

      await expect(mulliganOwnerPage.getByTestId('prompt-overlay')).toBeVisible()
      await expect(mulliganOwnerPage.getByTestId('prompt-option-mulligan')).toBeVisible()
      await expect(mulliganOwnerPage.getByTestId('prompt-option-noMulligan')).toBeVisible()
      await expect(mulliganOwnerPage.getByTestId('prompt-option-noMulligan')).toBeEnabled()
      await expect(nonOwnerPage.getByTestId('prompt-overlay')).toHaveCount(0)

      await resolvePromptViaHub(setup.gameCode, mulliganOwner, 'noMulligan')

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, mulliganOwner.session.accessToken)
        return state.pendingPrompt === null
      }, {
        timeout: 20_000,
      }).toBe(true)

      await expect(nonOwnerPage.getByTestId('phase-indicator')).not.toContainText('Waiting for opponent to choose mulligan')
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('prompts the player going second for mulligan and handles Take Mulligan', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)

      const mulliganPromptOwner = await waitUntilMulliganPromptOwner(request, setup)
      const mulliganOwnerPage = mulliganPromptOwner === 'playerOne' ? pages.playerOnePage : pages.playerTwoPage
      const mulliganOwner = mulliganPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      const nonOwnerPage = mulliganPromptOwner === 'playerOne' ? pages.playerTwoPage : pages.playerOnePage

      await expect(mulliganOwnerPage.getByTestId('prompt-overlay')).toBeVisible()
      await expect(mulliganOwnerPage.getByTestId('prompt-option-mulligan')).toBeVisible()
      await expect(mulliganOwnerPage.getByTestId('prompt-option-noMulligan')).toBeVisible()
      await expect(mulliganOwnerPage.getByTestId('prompt-option-mulligan')).toBeEnabled()
      await expect(nonOwnerPage.getByTestId('prompt-overlay')).toHaveCount(0)

      await resolvePromptViaHub(setup.gameCode, mulliganOwner, 'mulligan')

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, mulliganOwner.session.accessToken)
        return state.pendingPrompt === null
          && state.phase !== 'Mulligan'
      }, {
        timeout: 20_000,
      }).toBe(true)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
