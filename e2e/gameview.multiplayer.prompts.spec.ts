import { expect, test } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  fetchGameState,
  getAnimationCount,
  getCardFlightRecords,
  installAnimationCounter,
  installCardFlightCounter,
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

      // The opening hand is dealt before the mulligan decision, so the prompt must leave the board
      // inspectable: the player can hover a hand card, reveal its eye and read the details before answering.
      const mulliganHandCards = mulliganOwnerPage.locator('[data-testid="bottom-hand-row"] [data-hand-instance-id]')
      await expect(mulliganHandCards.first()).toBeVisible()
      await mulliganHandCards.first().hover()

      const openDetailsButton = mulliganHandCards.first().getByRole('button', { name: 'Open card details' })
      await expect(openDetailsButton).toBeVisible()
      await openDetailsButton.click()

      const detailsDialog = mulliganOwnerPage.getByRole('dialog')
      await expect(detailsDialog).toBeVisible()
      await mulliganOwnerPage.keyboard.press('Escape')
      await expect(detailsDialog).toHaveCount(0)

      // Reading a card must not answer the prompt: the overlay is still there until the player picks.
      await expect(mulliganOwnerPage.getByTestId('prompt-overlay')).toBeVisible()
      await expect(mulliganOwnerPage.getByTestId('prompt-option-noMulligan')).toBeEnabled()

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

      // The hand this mulligan is about to send back, read off the board: a card keeps its own element (and so
      // its own instance id) through the flight, which is what lets the assertion below name the cards. Scoped
      // to the owner's own row - the opponent's hand is rendered too and is not the hand being mulliganed.
      const mulliganHandInstanceIds = await mulliganOwnerPage
        .locator('[data-testid^="bottom-hand-card-"]')
        .evaluateAll((nodes) => nodes
          .map((node) => node.getAttribute('data-hand-instance-id') ?? '')
          .filter((instanceId) => instanceId !== ''))
      expect(mulliganHandInstanceIds.length).toBeGreaterThan(0)

      await installCardFlightCounter(mulliganOwnerPage)

      // Answered on the board rather than through the hub on purpose: the client's own resolution flow is the
      // one that flies the hand back into the deck, and resolving out of band skips it entirely.
      await mulliganOwnerPage.getByTestId('prompt-option-mulligan').click()

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

      // Every card of that hand leaves as itself: one flight per card, named, rather than a cumulative count of
      // something having moved. The missed ids are reported so a failure names the card that did not travel
      // instead of only a number.
      await expect.poll(async () => {
        const records = await getCardFlightRecords(mulliganOwnerPage)
        const handInstanceIds = new Set(mulliganHandInstanceIds)
        const travelledInstanceIds = new Set(
          records
            .filter((record) => handInstanceIds.has(record.instanceId))
            .map((record) => record.instanceId),
        )
        return {
          travelled: mulliganHandInstanceIds.filter((instanceId) => travelledInstanceIds.has(instanceId)).length,
          missed: mulliganHandInstanceIds.filter((instanceId) => !travelledInstanceIds.has(instanceId)),
        }
      }, {
        timeout: 10_000,
      }).toEqual({
        travelled: mulliganHandInstanceIds.length,
        missed: [],
      })
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
