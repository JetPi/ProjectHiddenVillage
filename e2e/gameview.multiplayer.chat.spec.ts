import { expect, test } from '@playwright/test'
import {
  closeMultiplayerPages,
  describeHubFailure,
  getGameChatHistoryViaHub,
  openMultiplayerPages,
  sendGameChatMessageViaHub,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

/**
 * Chat is its own stream on the game connection: it never rides the action gate, never refetches the board and
 * never shows up in the action log.
 *
 * The strip docks only while it would clear the board. The board is centred and capped at 1050px, so the panel needs
 * roughly 1590px of viewport before it stops hanging over the zones; a default 1280px window is behind the sidebar
 * button instead, and nothing is covered unless the player asks for it.
 */
const WIDE_VIEWPORT = { width: 1680, height: 900 }

test.describe('GameView multiplayer chat', () => {
  test.describe.configure({ timeout: 120_000 })

  test('docks on a wide viewport, delivers to the opponent and never overlaps the action log', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const senderPage = pages.playerOnePage
      const receiverPage = pages.playerTwoPage
      const messageText = `good luck ${Date.now()}`

      for (const page of [senderPage, receiverPage]) {
        await page.setViewportSize(WIDE_VIEWPORT)
      }

      // No button to press: the strip clears the board, so the panel is already on screen.
      await expect(senderPage.locator('[data-testid="game-chat-panel"]')).toBeVisible()
      await expect(senderPage.locator('[data-testid="game-chat-panel"]')).toHaveAttribute('data-dock', 'docked')
      await expect(senderPage.locator('[data-testid="game-chat-toggle"]')).toHaveCount(0)
      await expect(receiverPage.locator('[data-testid="game-chat-panel"]')).toBeVisible()

      // An empty composer cannot be sent: the button is the only way to submit.
      await expect(senderPage.locator('[data-testid="game-chat-send"]')).toBeDisabled()

      await senderPage.locator('[data-testid="game-chat-input"]').fill(messageText)
      await senderPage.locator('[data-testid="game-chat-send"]').click()

      const ownMessage = senderPage.locator('[data-testid="game-chat-message"]').filter({ hasText: messageText })
      await expect(ownMessage).toBeVisible({ timeout: 12_000 })
      await expect(ownMessage).toHaveAttribute('data-own', 'true')

      const receivedMessage = receiverPage.locator('[data-testid="game-chat-message"]').filter({ hasText: messageText })
      await expect(receivedMessage).toBeVisible({ timeout: 12_000 })
      await expect(receivedMessage).toHaveAttribute('data-own', 'false')

      // The log opens above the docked strip instead of over it, and it never carries a chat message.
      await receiverPage.locator('[data-testid="action-log-toggle"]').click()
      const logPanel = receiverPage.locator('[data-testid="action-log-panel"]')
      await expect(logPanel).toBeVisible()
      await expect(logPanel).not.toContainText(messageText)

      const logBox = await logPanel.boundingBox()
      const chatBox = await receiverPage.locator('[data-testid="game-chat-panel"]').boundingBox()
      expect(logBox).not.toBeNull()
      expect(chatBox).not.toBeNull()
      if (logBox && chatBox) {
        expect(logBox.y + logBox.height).toBeLessThanOrEqual(chatBox.y)
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('offers the sidebar button instead when the strip would overlap the board', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      // The default viewport is narrower than the board plus a 252px strip and its clearance.
      await expect(pages.playerOnePage.locator('[data-testid="game-chat-panel"]')).toHaveCount(0)
      await expect(pages.playerOnePage.locator('[data-testid="game-chat-toggle"]')).toHaveCount(1)

      await pages.playerOnePage.setViewportSize(WIDE_VIEWPORT)
      await expect(pages.playerOnePage.locator('[data-testid="game-chat-panel"]')).toBeVisible()
      await expect(pages.playerOnePage.locator('[data-testid="game-chat-toggle"]')).toHaveCount(0)

      const boardBox = await pages.playerOnePage.locator('[data-game-board]').boundingBox()
      const chatBox = await pages.playerOnePage.locator('[data-testid="game-chat-panel"]').boundingBox()
      expect(boardBox).not.toBeNull()
      expect(chatBox).not.toBeNull()
      if (boardBox && chatBox) {
        expect(boardBox.x + boardBox.width).toBeLessThanOrEqual(chatBox.x)
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('a reload keeps the backlog and the server refuses unusable text', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      for (const page of [pages.playerOnePage, pages.playerTwoPage]) {
        await page.setViewportSize(WIDE_VIEWPORT)
      }

      const messageText = `backlog ${Date.now()}`

      const sent = await sendGameChatMessageViaHub(setup.gameCode, setup.playerOne, messageText)
      expect(sent.succeeded, describeHubFailure('Hub.SendGameChatMessage', sent)).toBeTruthy()

      const overLong = await sendGameChatMessageViaHub(setup.gameCode, setup.playerTwo, 'x'.repeat(600))
      expect(overLong.succeeded).toBeFalsy()
      expect(overLong.errorCode).toBe('Game.Chat.TooLong')

      const blank = await sendGameChatMessageViaHub(setup.gameCode, setup.playerTwo, '   ')
      expect(blank.succeeded).toBeFalsy()
      expect(blank.errorCode).toBe('Game.Chat.Empty')

      await pages.playerTwoPage.reload()
      await expect(
        pages.playerTwoPage.locator('[data-testid="game-chat-message"]').filter({ hasText: messageText }),
      ).toBeVisible({ timeout: 15_000 })

      const history = await getGameChatHistoryViaHub(setup.gameCode, setup.playerTwo)
      expect(history.succeeded, describeHubFailure('Hub.GetGameChatHistory', history)).toBeTruthy()
      expect(history.value?.messages.map((message) => message.text)).toContain(messageText)
      expect(history.value?.messages.every((message) => message.senderPlayerId === setup.playerOne.normalizedUserId))
        .toBe(true)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
