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
  
  /**
   * The board's status dot reports the other seat. It follows the same rule as the rematch offer: the server grants a
   * short grace after a board stops watching, because a page reload unmounts and re-subscribes exactly like a departure.
   */
  test.describe('GameView multiplayer opponent presence', () => {
    test.describe.configure({ timeout: 120_000 })
  
    test('greens the dot while the opponent is on the board and reddens it once they are gone', async ({ browser, request }) => {
      const setup = await setupMultiplayerGame(request)
      const pages = await openMultiplayerPages(browser, setup)
  
      try {
        await waitUntilBothPlayersPresent(request, setup.gameCode, setup.playerOne.session.accessToken)
  
        await expect(pages.playerOnePage.getByTestId('opponent-presence-indicator')).toHaveAttribute('data-present', 'true')
        await expect(pages.playerTwoPage.getByTestId('opponent-presence-indicator')).toHaveAttribute('data-present', 'true')
  
        // Off the board altogether: the dot turns red, but only after the grace a refresh would have used.
        await pages.playerTwoPage.goto('/sign-in')
  
        await expect(pages.playerOnePage.getByTestId('opponent-presence-indicator')).toHaveAttribute(
          'data-present',
          'false',
          { timeout: 30_000 },
        )
  
        // Back on the board: green again, without a reload of the page that is watching.
        await pages.playerTwoPage.goto(`/game/${setup.gameCode}`)
  
        await expect(pages.playerOnePage.getByTestId('opponent-presence-indicator')).toHaveAttribute(
          'data-present',
          'true',
          { timeout: 30_000 },
        )
      } finally {
        await closeMultiplayerPages(pages)
      }
    })
  })
})
