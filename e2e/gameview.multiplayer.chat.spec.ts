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
 */
test.describe('GameView multiplayer chat', () => {
  test.describe.configure({ timeout: 120_000 })

  test('a message reaches the opponent, badges as unread and stays out of the action log', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const senderPage = pages.playerOnePage
      const receiverPage = pages.playerTwoPage
      const messageText = `good luck ${Date.now()}`

      await senderPage.locator('[data-testid="game-chat-toggle"]').click()
      await expect(senderPage.locator('[data-testid="game-chat-panel"]')).toBeVisible()

      // An empty composer cannot be sent: the button is the only way to submit.
      await expect(senderPage.locator('[data-testid="game-chat-send"]')).toBeDisabled()

      await senderPage.locator('[data-testid="game-chat-input"]').fill(messageText)
      await senderPage.locator('[data-testid="game-chat-send"]').click()

      const ownMessage = senderPage.locator('[data-testid="game-chat-message"]').filter({ hasText: messageText })
      await expect(ownMessage).toBeVisible({ timeout: 12_000 })
      await expect(ownMessage).toHaveAttribute('data-own', 'true')

      // The opponent keeps the panel closed, so the message badges as unread first.
      await expect(receiverPage.locator('[data-testid="game-chat-unread"]')).toBeVisible({ timeout: 12_000 })
      await receiverPage.locator('[data-testid="game-chat-toggle"]').click()

      const receivedMessage = receiverPage.locator('[data-testid="game-chat-message"]').filter({ hasText: messageText })
      await expect(receivedMessage).toBeVisible({ timeout: 12_000 })
      await expect(receivedMessage).toHaveAttribute('data-own', 'false')
      await expect(receiverPage.locator('[data-testid="game-chat-unread"]')).toBeHidden()

      // Reading the log closes the chat panel, and the log itself never carries a chat message.
      await receiverPage.locator('[data-testid="action-log-toggle"]').click()
      const logPanel = receiverPage.locator('[data-testid="action-log-panel"]')
      await expect(logPanel).toBeVisible()
      await expect(logPanel).not.toContainText(messageText)
      await expect(receiverPage.locator('[data-testid="game-chat-panel"]')).toBeHidden()
    } finally {
      await closeMultiplayerPages(pages)
    }
  })

  test('a reload keeps the backlog and the server refuses unusable text', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
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
      await pages.playerTwoPage.locator('[data-testid="game-chat-toggle"]').click()
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
