import { expect, test } from '@playwright/test'
import {
  closeMultiplayerPages,
  openMultiplayerPages,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'
import type { Locator, Page } from '@playwright/test'

// The chakra pool used to be pinned to a fixed rem width (`w-[2.22rem]` / `w-[2.32rem]`), so unlike every other
// card on the board it ignored the viewport: a taller window grew the battlefield, the leader and the pile cards
// while the chakra cards stayed exactly the same pixel size. They are height-driven now, like the pile cards, and
// these measurements are what keep them that way.
const SHORT_VIEWPORT = { width: 1280, height: 720 }
const TALL_VIEWPORT = { width: 1280, height: 1120 }
// `PlayCard`'s frame ratio, which the chakra frame inherits.
const CARD_ASPECT_RATIO = 200 / 277
const ASPECT_TOLERANCE = 0.06
// The chakra column is 66% of the resource rail. The rail itself is now `208px x --game-unit`, so the bound is
// measured from the rendered rail instead of pinned to 137px: that is what keeps the assertion meaningful at 720p,
// 1440p and 4K, where the rail is 208px, 333px and 499px wide.
const CHAKRA_COLUMN_SHARE = 0.66

test.describe('GameView chakra pool scaling', () => {
  test.describe.configure({ timeout: 120_000 })

  test('the chakra cards grow and shrink with the viewport instead of sitting at a fixed size', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const page = pages.playerOnePage
      const chakraCard = page.getByAltText('Chakra card').first()
      await expect(chakraCard).toBeVisible({ timeout: 15_000 })

      const short = await measure(page, chakraCard, SHORT_VIEWPORT)
      const tall = await measure(page, chakraCard, TALL_VIEWPORT)

      // Both axes must follow the viewport: the fixed-width version produced identical boxes here.
      expect(short.height).toBeGreaterThan(0)
      expect(tall.height).toBeGreaterThan(short.height * 1.1)
      expect(tall.width).toBeGreaterThan(short.width * 1.1)

      // And the rail that caps them grows with the same unit, so the card's share of it is what stays constant.
      expect(short.railWidth).toBeGreaterThan(0)
      expect(tall.railWidth).toBeGreaterThan(short.railWidth)

      // Scaling must keep the card's shape and stay inside the rail rather than spilling into the board.
      for (const box of [short, tall]) {
        expect(Math.abs(box.width / box.height - CARD_ASPECT_RATIO)).toBeLessThan(ASPECT_TOLERANCE)
        expect(box.width * 3).toBeLessThanOrEqual(box.railWidth * CHAKRA_COLUMN_SHARE + 1)
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})

async function measure(
  page: Page,
  chakraCard: Locator,
  viewport: { width: number; height: number },
): Promise<{ width: number; height: number; railWidth: number }> {
  await page.setViewportSize(viewport)
  // The board animates its split when the height changes; measure once it has settled.
  await page.waitForTimeout(400)

  const box = await chakraCard.boundingBox()
  if (!box) {
    throw new Error(`The chakra card had no box at ${viewport.width}x${viewport.height}.`)
  }

  // The resource rail is the first column of the board half that owns this card.
  const railWidth = await chakraCard.evaluate((element) => {
    const rail = element.closest('[data-board-half]')?.firstElementChild as HTMLElement | null

    return rail ? rail.getBoundingClientRect().width : 0
  })

  return { width: box.width, height: box.height, railWidth }
}
