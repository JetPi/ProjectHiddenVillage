import { expect, test } from '@playwright/test'
import {
  closeMultiplayerPages,
  openMultiplayerPages,
  setupMultiplayerGame,
  waitUntilBothPlayersPresent,
} from './helpers/gameviewMultiplayerHelpers'

test.describe('GameView multiplayer presence', () => {
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
})
