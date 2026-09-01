import { expect, test } from '@playwright/test'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'

const API_BASE_URL = 'http://127.0.0.1:3101'
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

type GameCardInstanceStateResponse = {
  instanceId: string
  cardDefinitionId?: string
  isExhausted?: boolean
  isRested?: boolean
  availableActions?: GameActionOptionResponse[]
}

type GamePlayerStateResponse = {
  playerId: string
  leader: {
    displayName: string
  }
  hand: GameCardInstanceStateResponse[]
  characterField: GameCardInstanceStateResponse[]
  supportZone: GameCardInstanceStateResponse[]
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

async function declareEndStepViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>('DeclareEndStep', gameCode.toUpperCase())

    expect(result.succeeded, `${result.errorCode ?? 'Hub.DeclareEndStep'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()
  } finally {
    await connection.stop()
  }
}

async function completeEndStepViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>('CompleteEndStep', gameCode.toUpperCase())

    expect(result.succeeded, `${result.errorCode ?? 'Hub.CompleteEndStep'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()
  } finally {
    await connection.stop()
  }
}

async function declarePassInActionStepViaHub(gameCode: string, player: PlayerAuth): Promise<void> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>('DeclarePassInActionStep', gameCode.toUpperCase(), {
      playerId: player.normalizedUserId,
    })

    expect(result.succeeded, `${result.errorCode ?? 'Hub.DeclarePassInActionStep'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()
  } finally {
    await connection.stop()
  }
}

async function executeBattleActionViaHub(
  gameCode: string,
  player: PlayerAuth,
  actionId: string,
  sourceCardInstanceId: string,
): Promise<{ targetCardInstanceId: string; targetZone: string; targetPlayerId: string }> {
  const connection = buildHubConnection(player.session.accessToken, player.userId)

  try {
    await connection.start()

    const targetsResult = await connection.invoke<{
      succeeded: boolean
      value?: {
        validTargets: Array<{
          playerId: string
          zone: string
          cardInstanceId: string
        }>
      }
      errorCode?: string | null
      errorDescription?: string | null
    }>('GetCardActionTargets', gameCode.toUpperCase(), {
      playerId: player.normalizedUserId,
      actionId,
      sourceCardInstanceId,
    })

    expect(targetsResult.succeeded, `${targetsResult.errorCode ?? 'Hub.GetCardActionTargets'}: ${targetsResult.errorDescription ?? 'Unknown error'}`).toBeTruthy()

    const validTargets = targetsResult.value?.validTargets ?? []
    expect(validTargets.length).toBeGreaterThan(0)

    const selectedTarget = validTargets.find((target) => target.zone === 'Leader') ?? validTargets[0]

    const result = await connection.invoke<{
      succeeded: boolean
      errorCode?: string | null
      errorDescription?: string | null
    }>('ExecuteCardAction', gameCode.toUpperCase(), {
      playerId: player.normalizedUserId,
      actionId,
      sourceCardInstanceId,
      selectedTargets: [selectedTarget],
    })

    expect(result.succeeded, `${result.errorCode ?? 'Hub.ExecuteCardAction'}: ${result.errorDescription ?? 'Unknown error'}`).toBeTruthy()

    return {
      targetCardInstanceId: selectedTarget.cardInstanceId,
      targetZone: selectedTarget.zone,
      targetPlayerId: selectedTarget.playerId,
    }
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

  for (let attempt = 0; attempt < 250; attempt += 1) {
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

async function resolveAllMulliganPrompts(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  selectedOption: 'mulligan' | 'noMulligan',
): Promise<void> {
  const maxPromptResolutions = 4

  for (let resolutionIndex = 0; resolutionIndex < maxPromptResolutions; resolutionIndex += 1) {
    const promptOwner = await getPromptOwnerByType(request, setup, 'Mulligan')
    if (promptOwner === 'none') {
      return
    }

    const owner = promptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
    await resolvePromptViaHub(setup.gameCode, owner, selectedOption)

    await expect.poll(async () => {
      const state = await fetchGameState(request, setup.gameCode, owner.session.accessToken)
      return state.pendingPrompt?.type ?? 'none'
    }, {
      timeout: 20_000,
    }).not.toBe('Mulligan')
  }

  throw new Error('Failed to fully resolve mulligan prompts within retry limit.')
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

async function installAnimationCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const marker = '__phvAnimateCounterInstalled'
    const state = window as unknown as {
      [key: string]: unknown
      __phvAnimateCount?: number
    }

    if (state[marker] === true) {
      return
    }

    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function patchedAnimate(
      keyframes: PropertyIndexedKeyframes | Keyframe[],
      options?: number | KeyframeAnimationOptions,
    ): Animation {
      const currentCount = typeof state.__phvAnimateCount === 'number' ? state.__phvAnimateCount : 0
      state.__phvAnimateCount = currentCount + 1
      return originalAnimate.call(this, keyframes, options)
    }

    state.__phvAnimateCount = 0
    state[marker] = true
  })
}

async function getAnimationCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const state = window as unknown as { __phvAnimateCount?: number }
    return typeof state.__phvAnimateCount === 'number' ? state.__phvAnimateCount : 0
  })
}

async function getBottomBattlefieldInstanceOrder(page: Page): Promise<string[]> {
  return await page
    .locator('[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id]')
    .evaluateAll((nodes) => {
      return nodes
        .map((node) => node.getAttribute('data-card-instance-id'))
        .filter((value): value is string => Boolean(value))
    })
}

async function getBottomSupportCardsBySlot(page: Page): Promise<Array<{ slotIndex: number; instanceId: string }>> {
  return await page
    .locator('[data-zone="support"][data-slot-side="bottom"][data-card-instance-id]')
    .evaluateAll((nodes) => {
      return nodes
        .map((node) => {
          const slotIndexRaw = node.getAttribute('data-slot-index')
          const instanceId = node.getAttribute('data-card-instance-id')
          return {
            slotIndex: slotIndexRaw ? Number.parseInt(slotIndexRaw, 10) : Number.NaN,
            instanceId,
          }
        })
        .filter((entry): entry is { slotIndex: number; instanceId: string } => {
          return Number.isInteger(entry.slotIndex) && entry.instanceId !== null
        })
    })
}

async function findBottomHandCardWithAction(page: Page, actionLabel: string): Promise<string | null> {
  return await page.evaluate((normalizedActionLabel) => {
    const normalizedLabel = normalizedActionLabel.trim().toLowerCase()
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="bottom-hand-card-"]'))

    for (const card of cards) {
      const cardInstanceId = card.getAttribute('data-hand-instance-id')
      if (!cardInstanceId) {
        continue
      }

      const actionButtons = Array.from(card.querySelectorAll<HTMLButtonElement>('.card-overlay-controls button'))
      const hasAction = actionButtons.some((button) => {
        const buttonText = (button.textContent ?? '').trim().toLowerCase()
        return buttonText === normalizedLabel && !button.disabled
      })

      if (hasAction) {
        return cardInstanceId
      }
    }

    return null
  }, actionLabel)
}

async function resolveActorWithBottomHandAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actionLabel: 'Summon' | 'Set Support',
): Promise<{ actor: PlayerAuth; actorPage: Page; cardInstanceId: string; actionId: string }> {
  const maxCycles = 180
  const actionPrefix = actionLabel === 'Summon' ? 'summon-to-field:' : 'set-support:'
  const normalizedLabel = actionLabel.trim().toLowerCase()

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const activePlayer = normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
      ? setup.playerOne
      : setup.playerTwo

    const playerOneCanUseHandActions =
      playerOneState.phase === 'MainPhase'
      && playerOneState.pendingPrompt === null
      && normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
    const playerTwoCanUseHandActions =
      playerTwoState.phase === 'MainPhase'
      && playerTwoState.pendingPrompt === null
      && normalizeUserId(playerTwoState.activePlayerId) === setup.playerTwo.normalizedUserId

    const resolveHandActionFromState = (state: GameStateResponse, actor: PlayerAuth) => {
      const actorState = resolvePlayerState(state, actor)
      for (const handCard of actorState.hand) {
        const availableActions = handCard.availableActions ?? []
        const matchedAction = availableActions.find((action) => {
          return action.isEnabled && action.label.trim().toLowerCase() === normalizedLabel
        })

        if (matchedAction) {
          return {
            cardInstanceId: handCard.instanceId,
            actionId: matchedAction.actionId,
          }
        }
      }

      return null
    }

    if (playerOneCanUseHandActions) {
      const resolvedAction = resolveHandActionFromState(playerOneState, setup.playerOne)
      if (resolvedAction) {
        return {
          actor: setup.playerOne,
          actorPage: pages.playerOnePage,
          cardInstanceId: resolvedAction.cardInstanceId,
          actionId: resolvedAction.actionId || `${actionPrefix}${resolvedAction.cardInstanceId}`,
        }
      }
    }

    if (playerTwoCanUseHandActions) {
      const resolvedAction = resolveHandActionFromState(playerTwoState, setup.playerTwo)
      if (resolvedAction) {
        return {
          actor: setup.playerTwo,
          actorPage: pages.playerTwoPage,
          cardInstanceId: resolvedAction.cardInstanceId,
          actionId: resolvedAction.actionId || `${actionPrefix}${resolvedAction.cardInstanceId}`,
        }
      }
    }

    const activePlayerState = activePlayer.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const canEndTurn = activePlayerState.availableActions.some((action) => action.actionId === 'turn-end' && action.isEnabled)
    if (canEndTurn) {
      await declareEndStepViaHub(setup.gameCode, activePlayer)
      await completeEndStepViaHub(setup.gameCode, activePlayer)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const playerOneCanPass = playerOneState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    if (playerOneCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerOne)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const playerTwoCanPass = playerTwoState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    if (playerTwoCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerTwo)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const canAdvance = activePlayerState.availableActions.some((action) => action.actionId === 'advance-phase' && action.isEnabled)
    if (!canAdvance) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      continue
    }

    await advancePhaseViaHub(setup.gameCode, activePlayer)
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  throw new Error(`No '${actionLabel}' action found in bottom hand after deterministic phase advancement.`)
}

async function resolvePlayerHandActionWithoutReload(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  player: PlayerAuth,
): Promise<{ cardInstanceId: string; actionLabel: string }> {
  const maxCycles = 180

  const resolveHandActionFromState = (state: GameStateResponse, actor: PlayerAuth) => {
    const actorState = resolvePlayerState(state, actor)

    for (const handCard of actorState.hand) {
      const availableActions = handCard.availableActions ?? []
      const matchedAction = availableActions.find((action) => {
        const normalizedLabel = action.label.trim().toLowerCase()
        return action.isEnabled && (normalizedLabel === 'summon' || normalizedLabel === 'set support')
      })

      if (matchedAction) {
        return {
          cardInstanceId: handCard.instanceId,
          actionLabel: matchedAction.label,
        }
      }
    }

    return null
  }

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const targetState = player.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const targetPlayerCanUseHandActions =
      targetState.phase === 'MainPhase'
      && targetState.pendingPrompt === null
      && normalizeUserId(targetState.activePlayerId) === player.normalizedUserId

    if (targetPlayerCanUseHandActions) {
      const resolvedAction = resolveHandActionFromState(targetState, player)
      if (resolvedAction) {
        return resolvedAction
      }
    }

    const activePlayer = normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
      ? setup.playerOne
      : setup.playerTwo
    const activePlayerState = activePlayer.userId === setup.playerOne.userId ? playerOneState : playerTwoState

    const canEndTurn = activePlayerState.availableActions.some((action) => action.actionId === 'turn-end' && action.isEnabled)
    if (canEndTurn) {
      await declareEndStepViaHub(setup.gameCode, activePlayer)
      await completeEndStepViaHub(setup.gameCode, activePlayer)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const playerOneCanPass = playerOneState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    if (playerOneCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerOne)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const playerTwoCanPass = playerTwoState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    if (playerTwoCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerTwo)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const canAdvance = activePlayerState.availableActions.some((action) => action.actionId === 'advance-phase' && action.isEnabled)
    if (!canAdvance) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      continue
    }

    await advancePhaseViaHub(setup.gameCode, activePlayer)
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  throw new Error(`No enabled bottom-hand Summon/Set Support action found for player '${player.userId}' within retry limit.`)
}

async function resolveActorWithBottomBattleAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<{ actor: PlayerAuth; actorPage: Page; cardInstanceId: string; actionLabel: string; actionId: string }> {
  const maxCycles = 180

  const resolveBattleActionFromState = (state: GameStateResponse, actor: PlayerAuth) => {
    const actorState = resolvePlayerState(state, actor)
    for (const battleCard of actorState.characterField) {
      const availableActions = battleCard.availableActions ?? []
      const matchedAction = availableActions.find((action) => {
        return action.isEnabled && action.label.trim().toLowerCase() === 'battle'
      })

      if (matchedAction) {
        return {
          cardInstanceId: battleCard.instanceId,
          actionLabel: matchedAction.label,
          actionId: matchedAction.actionId,
        }
      }
    }

    return null
  }

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const activePlayer = normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
      ? setup.playerOne
      : setup.playerTwo
    const activePlayerState = activePlayer.userId === setup.playerOne.userId ? playerOneState : playerTwoState

    if (
      activePlayerState.phase === 'MainPhase'
      && activePlayerState.pendingPrompt === null
    ) {
      const resolvedAction = activePlayer.userId === setup.playerOne.userId
        ? resolveBattleActionFromState(playerOneState, setup.playerOne)
        : resolveBattleActionFromState(playerTwoState, setup.playerTwo)

      if (resolvedAction) {
        return {
          actor: activePlayer,
          actorPage: activePlayer.userId === setup.playerOne.userId ? pages.playerOnePage : pages.playerTwoPage,
          cardInstanceId: resolvedAction.cardInstanceId,
          actionLabel: resolvedAction.actionLabel,
          actionId: resolvedAction.actionId,
        }
      }
    }

    const canEndTurn = activePlayerState.availableActions.some((action) => action.actionId === 'turn-end' && action.isEnabled)
    if (canEndTurn) {
      await declareEndStepViaHub(setup.gameCode, activePlayer)
      await completeEndStepViaHub(setup.gameCode, activePlayer)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const playerOneCanPass = playerOneState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    if (playerOneCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerOne)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const playerTwoCanPass = playerTwoState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    if (playerTwoCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerTwo)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const canAdvance = activePlayerState.availableActions.some((action) => action.actionId === 'advance-phase' && action.isEnabled)
    if (!canAdvance) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      continue
    }

    await advancePhaseViaHub(setup.gameCode, activePlayer)
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  throw new Error('No enabled battlefield Battle action was found within retry limit.')
}

async function resolveBattleActionForSpecificCard(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actor: PlayerAuth,
  cardInstanceId: string,
): Promise<{ actor: PlayerAuth; actorPage: Page; cardInstanceId: string; actionLabel: string; actionId: string }> {
  const maxCycles = 180

  const resolveSpecificBattleActionFromState = (state: GameStateResponse) => {
    const actorState = resolvePlayerState(state, actor)
    const actorCard = actorState.characterField.find((card) => card.instanceId === cardInstanceId)
    if (!actorCard) {
      return null
    }

    const matchedAction = (actorCard.availableActions ?? []).find((action) => {
      return action.isEnabled && action.label.trim().toLowerCase() === 'battle'
    })

    if (!matchedAction) {
      return null
    }

    return {
      cardInstanceId,
      actionLabel: matchedAction.label,
      actionId: matchedAction.actionId,
    }
  }

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const actorState = actor.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const resolvedAction = resolveSpecificBattleActionFromState(actorState)
    if (resolvedAction) {
      return {
        actor,
        actorPage: actor.userId === setup.playerOne.userId ? pages.playerOnePage : pages.playerTwoPage,
        cardInstanceId: resolvedAction.cardInstanceId,
        actionLabel: resolvedAction.actionLabel,
        actionId: resolvedAction.actionId,
      }
    }

    const activePlayer = normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
      ? setup.playerOne
      : setup.playerTwo
    const activePlayerState = activePlayer.userId === setup.playerOne.userId ? playerOneState : playerTwoState

    const canEndTurn = activePlayerState.availableActions.some((action) => action.actionId === 'turn-end' && action.isEnabled)
    if (canEndTurn) {
      await declareEndStepViaHub(setup.gameCode, activePlayer)
      await completeEndStepViaHub(setup.gameCode, activePlayer)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const playerOneCanPass = playerOneState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    if (playerOneCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerOne)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const playerTwoCanPass = playerTwoState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
    if (playerTwoCanPass) {
      await declarePassInActionStepViaHub(setup.gameCode, setup.playerTwo)
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    const canAdvance = activePlayerState.availableActions.some((action) => action.actionId === 'advance-phase' && action.isEnabled)
    if (!canAdvance) {
      await new Promise((resolve) => setTimeout(resolve, 350))
      continue
    }

    await advancePhaseViaHub(setup.gameCode, activePlayer)
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  throw new Error(`No enabled Battle action was found for card '${cardInstanceId}' within retry limit.`)
}

function resolvePlayerState(state: GameStateResponse, player: PlayerAuth): GamePlayerStateResponse {
  const matchedPlayer = state.players.find((entry) => normalizeUserId(entry.playerId) === player.normalizedUserId)
  if (!matchedPlayer) {
    throw new Error(`Player state '${player.userId}' was not found in game state response.`)
  }

  return matchedPlayer
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

  test('mulligan resolution triggers transfer animations on the prompt owner view', async ({ browser, request }) => {
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

      await expect(mulliganOwnerPage.getByTestId('prompt-overlay')).toBeVisible()
      await expect(mulliganOwnerPage.getByTestId('prompt-option-mulligan')).toBeEnabled()

      await installAnimationCounter(mulliganOwnerPage)
      const initialAnimationCount = await getAnimationCount(mulliganOwnerPage)

      await resolvePromptViaHub(setup.gameCode, mulliganOwner, 'mulligan')

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, mulliganOwner.session.accessToken)
        return state.pendingPrompt === null && state.phase !== 'Mulligan'
      }, {
        timeout: 20_000,
      }).toBe(true)

      await expect.poll(async () => {
        return await getAnimationCount(mulliganOwnerPage)
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(initialAnimationCount)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('summon transition animates and appends to rightmost battlefield slot', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
      const ownerPage = summonActor.actorPage
      const summonCardInstanceId = summonActor.cardInstanceId

      await installAnimationCounter(ownerPage)
      const initialAnimationCount = await getAnimationCount(ownerPage)
      const initialBattlefieldOrder = await getBottomBattlefieldInstanceOrder(ownerPage)

      const summonCard = ownerPage.locator(`[data-testid="bottom-hand-card-${summonCardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return actorState.characterField.some((card) => card.instanceId === summonCardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      await expect.poll(async () => {
        return await getBottomBattlefieldInstanceOrder(ownerPage)
      }, {
        timeout: 12_000,
      }).toHaveLength(initialBattlefieldOrder.length + 1)

      const finalBattlefieldOrder = await getBottomBattlefieldInstanceOrder(ownerPage)
      expect(finalBattlefieldOrder[finalBattlefieldOrder.length - 1]).toBe(summonCardInstanceId)

      await expect.poll(async () => {
        return await getAnimationCount(ownerPage)
      }, {
        timeout: 6_000,
      }).toBeGreaterThan(initialAnimationCount)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('set support requires slot selection and places card in selected slot with animation', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const supportActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Set Support')
      const ownerPage = supportActor.actorPage
      const supportCardInstanceId = supportActor.cardInstanceId

      await installAnimationCounter(ownerPage)
      const initialAnimationCount = await getAnimationCount(ownerPage)

      const initialSupportCards = await getBottomSupportCardsBySlot(ownerPage)
      const occupiedSlots = new Set(initialSupportCards.map((entry) => entry.slotIndex))
      const emptySlotIndex = [0, 1, 2, 3, 4].find((slotIndex) => !occupiedSlots.has(slotIndex))

      expect(typeof emptySlotIndex).toBe('number')
      if (typeof emptySlotIndex !== 'number') {
        return
      }

      const supportCard = ownerPage.locator(`[data-testid="bottom-hand-card-${supportCardInstanceId}"]`)
      await supportCard.hover()
      await supportCard.getByRole('button', { name: /^set support$/i }).click()

      await expect.poll(async () => {
        return (await getBottomSupportCardsBySlot(ownerPage)).length
      }, {
        timeout: 2_000,
      }).toBe(initialSupportCards.length)

      await ownerPage.locator(`button[data-zone="support"][data-slot-side="bottom"][data-slot-index="${emptySlotIndex}"]`).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, supportActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, supportActor.actor)
        return actorState.supportZone.some((card) => card.instanceId === supportCardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      await expect.poll(async () => {
        return await getBottomSupportCardsBySlot(ownerPage)
      }, {
        timeout: 12_000,
      }).toEqual(expect.arrayContaining([
        {
          slotIndex: emptySlotIndex,
          instanceId: supportCardInstanceId,
        },
      ]))

      await expect.poll(async () => {
        return await getAnimationCount(ownerPage)
      }, {
        timeout: 6_000,
      }).toBeGreaterThan(initialAnimationCount)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('joining player receives card options without manual reload', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const playerTwoAction = await resolvePlayerHandActionWithoutReload(request, setup, setup.playerTwo)
      const playerTwoCard = pages.playerTwoPage.locator(`[data-testid="bottom-hand-card-${playerTwoAction.cardInstanceId}"]`)

      await expect(playerTwoCard).toBeVisible()
      await playerTwoCard.hover()

      await expect(playerTwoCard.getByRole('button', { name: new RegExp(`^${playerTwoAction.actionLabel}$`, 'i') })).toBeVisible({ timeout: 10_000 })
      await expect(playerTwoCard.getByRole('button', { name: new RegExp(`^${playerTwoAction.actionLabel}$`, 'i') })).toBeEnabled()
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('battle action click enters target selection mode', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
      const summonCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return actorState.characterField.some((card) => card.instanceId === summonActor.cardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const battleActor = await resolveActorWithBottomBattleAction(request, setup, pages)
      const battleCard = battleActor.actorPage.locator(`[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${battleActor.cardInstanceId}"]`)

      await expect(battleCard).toBeVisible()
      await battleCard.hover()
      await battleCard.getByRole('button', { name: new RegExp(`^${battleActor.actionLabel}$`, 'i') }).click()

      await expect(battleActor.actorPage.getByRole('button', { name: /cancel attack target selection/i })).toBeVisible({ timeout: 8_000 })

      await expect.poll(async () => {
        return await battleActor.actorPage
          .locator('[data-zone="character-field-card"][class*="ring-amber-400"], [data-zone="leader-card"][class*="ring-amber-400"]')
          .count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('refresh during pending attack keeps attacker rested from backend state', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      const summonActor = await resolveActorWithBottomHandAction(request, setup, pages, 'Summon')
      const summonCard = summonActor.actorPage.locator(`[data-testid="bottom-hand-card-${summonActor.cardInstanceId}"]`)
      await summonCard.hover()
      await summonCard.getByRole('button', { name: /^summon$/i }).click()

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, summonActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, summonActor.actor)
        return actorState.characterField.some((card) => card.instanceId === summonActor.cardInstanceId)
      }, {
        timeout: 12_000,
      }).toBe(true)

      const battleActor = await resolveBattleActionForSpecificCard(
        request,
        setup,
        pages,
        summonActor.actor,
        summonActor.cardInstanceId,
      )

      const selectedTarget = await executeBattleActionViaHub(
        setup.gameCode,
        battleActor.actor,
        battleActor.actionId,
        battleActor.cardInstanceId,
      )

      await expect.poll(async () => {
        return await battleActor.actorPage.locator('#attack-link-overlay').count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, battleActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, battleActor.actor)
        const attackerCard = actorState.characterField.find((card) => card.instanceId === battleActor.cardInstanceId)

        return {
          found: Boolean(attackerCard),
          hasRestFlag: attackerCard ? Object.prototype.hasOwnProperty.call(attackerCard, 'isRested') : false,
          isRested: attackerCard?.isRested ?? false,
        }
      }, {
        timeout: 12_000,
      }).toEqual({
        found: true,
        hasRestFlag: true,
        isRested: true,
      })

      await battleActor.actorPage.reload()
      await expect(battleActor.actorPage.getByTestId('game-board')).toBeVisible()

      const attackerAfterReload = battleActor.actorPage.locator(
        `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${battleActor.cardInstanceId}"]`,
      )
      const targetAfterReload = battleActor.actorPage.locator(
        `[data-card-instance-id="${selectedTarget.targetCardInstanceId}"]`,
      )

      await expect(attackerAfterReload).toBeVisible()
      await expect(targetAfterReload).toBeVisible()
      await expect.poll(async () => {
        return await battleActor.actorPage.locator('#attack-link-overlay').count()
      }, {
        timeout: 8_000,
      }).toBeGreaterThan(0)

      await expect.poll(async () => {
        return await attackerAfterReload.getAttribute('class')
      }, {
        timeout: 8_000,
      }).toContain('rotate-[14deg]')

      await expect.poll(async () => {
        return await attackerAfterReload.getAttribute('class')
      }, {
        timeout: 8_000,
      }).toContain('attack-link-card-outline')

      await expect.poll(async () => {
        return await targetAfterReload.getAttribute('class')
      }, {
        timeout: 8_000,
      }).toContain('attack-link-card-outline')

      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, battleActor.actor.session.accessToken)
        const actorState = resolvePlayerState(state, battleActor.actor)
        const attackerCard = actorState.characterField.find((card) => card.instanceId === battleActor.cardInstanceId)

        return {
          found: Boolean(attackerCard),
          hasRestFlag: attackerCard ? Object.prototype.hasOwnProperty.call(attackerCard, 'isRested') : false,
          isRested: attackerCard?.isRested ?? false,
        }
      }, {
        timeout: 8_000,
      }).toEqual({
        found: true,
        hasRestFlag: true,
        isRested: true,
      })
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
