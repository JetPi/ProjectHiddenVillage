import { expect, test } from '@playwright/test'
import { TINY_WEBP_BASE64 } from './helpers/adminCardMocks'
import {
  closeMultiplayerPages,
  openMultiplayerPages,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'
import type { Locator } from '@playwright/test'

// Every board surface used to request one fixed width (240 px for everything except the preview panel), so a leader
// card drawn ~290 CSS px wide was upscaled 1.2x on a 1x screen and 3.6x on a 3x one - the blur and the blocky edges
// that got reported as "the cards warp and go pixely". `CARD_ART_WIDTH_LADDER` plus a per-surface `sizes` replaced
// that, and these assertions are what stop a surface from quietly falling back to a single width again.
const WIDTH_LADDER = [120, 240, 360, 600, 900]

test.describe('GameView card art sizing', () => {
  test.describe.configure({ timeout: 120_000 })

  test('a board card offers the whole ladder and selects a source that covers its box', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const page = pages.playerOnePage

      // Seeded art points at `example.com`, so `/api/card-art` 404s and `CardImage` swaps in its placeholder - which
      // would leave no <img> to inspect. Mocking the art route keeps the real element in place.
      await page.route('**/api/card-art/**', (route) =>
        route.fulfill({ status: 200, contentType: 'image/webp', body: Buffer.from(TINY_WEBP_BASE64, 'base64') }))
      await page.reload()
      await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 30_000 })

      const leaderImage = page.locator('[data-zone="leader-card"] img').first()
      await expect(leaderImage).toBeVisible({ timeout: 15_000 })

      const srcSet = await leaderImage.getAttribute('srcset')
      expect(srcSet, 'the leader card has to offer the full width ladder').toBeTruthy()

      for (const width of WIDTH_LADDER) {
        expect(srcSet, `width ${width} is missing from the ladder`).toContain(`w=${width}`)
        expect(srcSet, `width ${width} has no ${width}w descriptor`).toContain(`${width}w`)
      }

      // `sizes` is what turns the ladder into a choice: without it the browser assumes 100vw and always takes the
      // widest file, which would make every card download the master.
      const sizes = await leaderImage.getAttribute('sizes')
      expect(sizes, 'the leader surface has to declare its drawn width').toContain('290px')

      const selection = await measureSelection(leaderImage)
      expect(
        selection.sourceWidth,
        `leader art did not resolve through the card art endpoint: '${selection.currentSrc}'`,
      ).not.toBeNull()

      // The whole point of the sweep: the file the browser picked has to be at least as wide as the card is drawn,
      // and it has to cover a 2x screen for the largest surface on the board.
      expect(selection.sourceWidth!).toBeGreaterThanOrEqual(Math.floor(selection.renderedWidth))
      expect(selection.sourceWidth!).toBeGreaterThanOrEqual(
        Math.floor(selection.renderedWidth * Math.min(selection.devicePixelRatio, 2)),
      )
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})

async function measureSelection(
  image: Locator,
): Promise<{ currentSrc: string; renderedWidth: number; sourceWidth: number | null; devicePixelRatio: number }> {
  return image.evaluate((element) => {
    const img = element as HTMLImageElement
    const match = /[?&]w=(\d+)/.exec(img.currentSrc)

    return {
      currentSrc: img.currentSrc,
      renderedWidth: img.getBoundingClientRect().width,
      sourceWidth: match ? Number(match[1]) : null,
      devicePixelRatio: window.devicePixelRatio || 1,
    }
  })
}
