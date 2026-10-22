import { expect, test } from '@playwright/test'
import {
  closeMultiplayerPages,
  openMultiplayerPages,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'

// Regression guard for the wedged board: the hub handshake used to give up after three 600 ms attempts, so a
// board opened while the API was restarting (`dotnet watch`, a deploy) stayed inert - the starting-player
// prompt rendered its options permanently disabled and nothing retried. The prompt owner's first three
// negotiate requests are failed here, i.e. one more than the old attempt budget, so this test only passes when
// the retry loop keeps going after the initial handshake gave up.
const FAILED_NEGOTIATE_ATTEMPTS = 3

test.describe('GameView multiplayer hub recovery', () => {
  test.describe.configure({ timeout: 120_000 })

  test('recovers the prompt options after the hub is unavailable while the board opens', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request, 'default', {}, { warmStart: false })
    const promptOwnerKey = await resolveStartingPromptOwner(request, setup)

    let failedNegotiates = 0

    const pages = await openMultiplayerPages(browser, setup, {
      preparePage: async (page, playerKey) => {
        if (playerKey !== promptOwnerKey) {
          return
        }

        await page.route('**/hubs/games/negotiate**', async (route) => {
          failedNegotiates += 1

          if (failedNegotiates <= FAILED_NEGOTIATE_ATTEMPTS) {
            await route.abort('failed')
            return
          }

          await route.continue()
        })
      },
    })

    try {
      const ownerPage = promptOwnerKey === 'playerOne' ? pages.playerOnePage : pages.playerTwoPage

      // The board explains the disabled options instead of leaving them silently dead.
      await expect(ownerPage.getByTestId('prompt-overlay')).toBeVisible({ timeout: 30_000 })
      await expect(ownerPage.getByTestId('prompt-option-goFirst')).toBeDisabled()
      await expect(ownerPage.getByTestId('prompt-reconnecting-note')).toBeVisible({ timeout: 20_000 })

      // The recovery itself: no reload, no click, the retry loop reconnects and offers the choice again.
      await expect(ownerPage.getByTestId('prompt-option-goFirst')).toBeEnabled({ timeout: 30_000 })
      await expect(ownerPage.getByTestId('prompt-reconnecting-note')).toHaveCount(0)
      expect(failedNegotiates).toBeGreaterThanOrEqual(FAILED_NEGOTIATE_ATTEMPTS)
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})
