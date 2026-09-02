import { expect, test } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  fetchGameState,
  getAnimationCount,
  installAnimationCounter,
  normalizeUserId,
  openMultiplayerPages,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
  waitUntilMulliganPromptOwner,
} from './helpers/gameviewMultiplayerHelpers'

test.describe('GameView multiplayer prompts', () => {
  test.describe.configure({ timeout: 120_000 })

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
})
