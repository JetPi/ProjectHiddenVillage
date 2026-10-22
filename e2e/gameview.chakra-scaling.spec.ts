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
// The chakra column is 66% of the 208px resource rail; three cards plus two 1px gaps have to fit inside it.
const CHAKRA_COLUMN_WIDTH_PX = 137

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

      // Scaling must keep the card's shape and stay inside the rail rather than spilling into the board.
      for (const box of [short, tall]) {
        expect(Math.abs(box.width / box.height - CARD_ASPECT_RATIO)).toBeLessThan(ASPECT_TOLERANCE)
        expect(box.width * 3).toBeLessThanOrEqual(CHAKRA_COLUMN_WIDTH_PX)
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
): Promise<{ width: number; height: number }> {
  await page.setViewportSize(viewport)
  // The board animates its split when the height changes; measure once it has settled.
  await page.waitForTimeout(400)

  const box = await chakraCard.boundingBox()
  if (!box) {
    throw new Error(`The chakra card had no box at ${viewport.width}x${viewport.height}.`)
  }

  return { width: box.width, height: box.height }
}
