import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  openMultiplayerPages,
  resolveAllMulliganPrompts,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
} from './helpers/gameviewMultiplayerHelpers'
import type { MultiplayerPages, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'

async function getBottomHandInstanceOrder(page: Page): Promise<string[]> {
  const order = await page
    .locator('[data-testid="bottom-hand-row"] [data-hand-instance-id]')
    .evaluateAll((nodes) => {
      return nodes
        .map((node) => node.getAttribute('data-hand-instance-id'))
        .filter((value): value is string => Boolean(value))
    })

  return order
}

test.describe('GameView', () => {
  test.describe.configure({ timeout: 120_000 })

  test.describe('started two-player smoke', () => {
    let setup: MultiplayerSetup
    let pages: MultiplayerPages
    let page: Page

    test.beforeEach(async ({ browser, request }) => {
      setup = await setupMultiplayerGame(request)
      pages = await openMultiplayerPages(browser, setup)

      const startingPromptOwner = await resolveStartingPromptOwner(request, setup)
      const startingOwner = startingPromptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
      await resolvePromptViaHub(setup.gameCode, startingOwner, 'goFirst')

      await advanceToMulliganPromptIfNeeded(request, setup)
      await resolveAllMulliganPrompts(request, setup, 'noMulligan')

      page = pages.playerOnePage
      await expect(page.getByTestId('game-board')).toBeVisible()
    })

    test.afterEach(async () => {
      await closeMultiplayerPages(pages)
    })

    test('renders started board with stable anchors', async () => {
      await expect(page.getByText('Route Error')).toHaveCount(0)
      await expect(page.getByTestId('game-board')).toBeVisible()
      await expect(page.getByTestId('game-join-code')).toContainText(setup.gameCode)

      await expect(page.getByTestId('top-hand-row')).toBeVisible()
      await expect(page.getByTestId('bottom-hand-row')).toBeVisible()
      await expect(page.locator('[data-zone="character-field-row"][data-slot-side="top"]')).toBeVisible()
      await expect(page.locator('[data-zone="character-field-row"][data-slot-side="bottom"]')).toBeVisible()

      const passTurnButton = page.getByTestId('pass-turn-button')
      await expect(passTurnButton).toBeVisible({ timeout: 60_000 })
    })

    test('supports key interactions without crashing game view', async () => {
      await expect(page.getByText('Route Error')).toHaveCount(0)
      await expect(page.getByTestId('game-board')).toBeVisible()

      const passTurnBeforeTheme = page.getByTestId('pass-turn-button')
      await expect(passTurnBeforeTheme).toBeVisible()

      await page.getByRole('button', { name: 'Toggle light and dark mode' }).click()

      await expect(page.getByTestId('game-board')).toBeVisible()

      const passTurnButton = page.getByTestId('pass-turn-button')
      await expect(passTurnButton).toBeVisible()

      if (await passTurnButton.isEnabled()) {
        await passTurnButton.click()
      }

      await expect(page.getByTestId('game-board')).toBeVisible()
      await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
    })

    test('allows long-press reordering in bottom hand', async () => {
      await expect(page.getByTestId('game-board')).toBeVisible()

      const initialOrder = await getBottomHandInstanceOrder(page)
      expect(initialOrder.length).toBeGreaterThanOrEqual(2)

      const firstCardInstanceId = initialOrder[0]
      const secondCardInstanceId = initialOrder[1]

      const draggedCard = page.locator(`[data-testid="bottom-hand-card-${firstCardInstanceId}"]`)
      const secondCard = page.locator(`[data-testid="bottom-hand-card-${secondCardInstanceId}"]`)

      const draggedBox = await draggedCard.boundingBox()
      const secondBox = await secondCard.boundingBox()

      expect(draggedBox).not.toBeNull()
      expect(secondBox).not.toBeNull()

      if (!draggedBox || !secondBox) {
        return
      }

      let reordered = false

      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.mouse.move(draggedBox.x + draggedBox.width / 2, draggedBox.y + draggedBox.height / 2)
        await page.mouse.down()
        await page.waitForTimeout(360)
        await page.mouse.move(secondBox.x + secondBox.width + 24, secondBox.y + secondBox.height / 2)
        await page.mouse.up()
        await page.waitForTimeout(120)

        const nextOrder = await getBottomHandInstanceOrder(page)
        const firstIndex = nextOrder.indexOf(firstCardInstanceId)
        const secondIndex = nextOrder.indexOf(secondCardInstanceId)

        if (firstIndex >= 0 && secondIndex >= 0 && firstIndex > secondIndex) {
          reordered = true
          break
        }
      }

      expect(reordered).toBe(true)
    })
  })
})
