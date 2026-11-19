import { expect, test } from '@playwright/test'
import {
  closeMultiplayerPages,
  openMultiplayerPages,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'
import type { Page } from '@playwright/test'

/**
 * The board used to stop growing at 1050px while its labels stayed at 8-10px, so a bigger window made the play area
 * look smaller and the text harder to read at the same time. The sizing contract now has two ladders: `--game-unit`
 * (window height) drives every label, chip, icon and rail, and `--gameboard-max-width` (window width) drives how much
 * room the board claims. Above 1600px the surface also reserves a right gutter for the docked HUD.
 *
 * These rungs are the contract, from the laptop the suite already ran on to a 4K panel at 100% scaling, where the
 * board is capped at 3000px and the in-card labels are 2.4x their base size.
 */
const RUNGS = [
  { width: 1280, height: 720, boardWidthPx: 1050, labelFontPx: 10, hudDocked: false },
  { width: 1920, height: 1080, boardWidthPx: 1600, labelFontPx: 12, hudDocked: true },
  { width: 2560, height: 1440, boardWidthPx: 1900, labelFontPx: 16, hudDocked: true },
  { width: 3840, height: 2160, boardWidthPx: 3000, labelFontPx: 24, hudDocked: true },
] as const

const SIZE_TOLERANCE_PX = 1

test.describe('GameView large-screen layout', () => {
  test.describe.configure({ timeout: 180_000 })

  test('the board and its labels climb the ladder and never cover the docked HUD', async ({ browser, request }) => {
    const setup = await setupMultiplayerGame(request)
    const pages = await openMultiplayerPages(browser, setup)

    try {
      const page = pages.playerOnePage
      await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 30_000 })

      for (const rung of RUNGS) {
        await page.setViewportSize({ width: rung.width, height: rung.height })
        // The board animates its split when the height changes; measure once it has settled.
        await page.waitForTimeout(450)

        const board = await page.locator('[data-game-board]').boundingBox()
        expect(board, `the board had no box at ${rung.width}x${rung.height}`).not.toBeNull()

        expect(
          board!.width,
          `the board should claim ${rung.boardWidthPx}px at ${rung.width}x${rung.height}`,
        ).toBeGreaterThanOrEqual(rung.boardWidthPx - SIZE_TOLERANCE_PX)
        expect(
          board!.width,
          `the board should not exceed ${rung.boardWidthPx}px at ${rung.width}x${rung.height}`,
        ).toBeLessThanOrEqual(rung.boardWidthPx + SIZE_TOLERANCE_PX)

        const labelFontPx = await readPileLabelFontPx(page)
        expect(
          labelFontPx,
          `an in-card label should be about ${rung.labelFontPx}px at ${rung.width}x${rung.height}`,
        ).toBeGreaterThanOrEqual(rung.labelFontPx - SIZE_TOLERANCE_PX)
        expect(
          labelFontPx,
          `an in-card label should not exceed ${rung.labelFontPx}px at ${rung.width}x${rung.height}`,
        ).toBeLessThanOrEqual(rung.labelFontPx + SIZE_TOLERANCE_PX)

        // The ladder is capped by the room the shell actually gives the board, so it must never overflow sideways.
        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(
          horizontalOverflow,
          `the document should not scroll sideways at ${rung.width}x${rung.height}`,
        ).toBeLessThanOrEqual(1)

        const chatPanel = page.locator('[data-testid="game-chat-panel"]')
        if (rung.hudDocked) {
          await expect(chatPanel, `the chat should dock at ${rung.width}x${rung.height}`).toBeVisible({
            timeout: 15_000,
          })
          const chatBox = await chatPanel.boundingBox()
          expect(chatBox).not.toBeNull()
          expect(
            board!.x + board!.width,
            `the board should stop short of the HUD at ${rung.width}x${rung.height}`,
          ).toBeLessThanOrEqual(chatBox!.x)
        } else {
          await expect(
            chatPanel,
            `the chat should stay behind the sidebar button at ${rung.width}x${rung.height}`,
          ).toHaveCount(0)
        }
      }
    } finally {
      await closeMultiplayerPages(pages)
    }
  })
})

/**
 * The pile label is the smallest piece of type on the board and it is readable from the first frame, which makes it a
 * stable probe for the unit: it is `--game-font-sm`, i.e. `10 x --game-unit`.
 */
async function readPileLabelFontPx(page: Page): Promise<number> {
  const pileLabel = page.locator('[data-testid="trash-pile-card"]').first()
  await expect(pileLabel).toBeVisible({ timeout: 15_000 })

  return pileLabel.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
}
