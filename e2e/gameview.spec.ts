import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function openReadyGameView(page: Page, gameCode: string): Promise<void> {
  const maxAttempts = 8

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await page.goto(`/game/${gameCode}`)

    try {
      await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 5_000 })
      return
    } catch {
      // Route can transiently show error/loading while backend seed/runtime initializes.
    }

    await page.waitForTimeout(1000)
  }

  throw new Error('GameView route stayed in 400 Route Error state after retries.')
}

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

  test.describe('seeded single-player smoke', () => {
    test.beforeEach(async ({ page }) => {
      await openReadyGameView(page, 'TEST1')
    })

    test('renders seeded TEST1 board with stable anchors', async ({ page }) => {
      await expect(page.getByText('Route Error')).toHaveCount(0)
      await expect(page.getByTestId('game-board')).toBeVisible()
      await expect(page.getByText('Waiting for player')).toBeVisible()
      await expect(page.getByText('TEST1')).toBeVisible()

      await expect(page.getByTestId('top-hand-row')).toBeVisible()
      await expect(page.getByTestId('bottom-hand-row')).toBeVisible()
      await expect(page.locator('[data-zone="character-field-row"][data-slot-side="top"]')).toBeVisible()
      await expect(page.locator('[data-zone="character-field-row"][data-slot-side="bottom"]')).toBeVisible()

      const passTurnButton = page.getByTestId('pass-turn-button')
      await expect(passTurnButton).toBeVisible({ timeout: 60_000 })
    })

    test('supports key interactions without crashing game view', async ({ page }) => {
      await expect(page.getByText('Route Error')).toHaveCount(0)
      await expect(page.getByTestId('game-board')).toBeVisible()

      const passTurnBeforeTheme = page.getByTestId('pass-turn-button')
      await expect(passTurnBeforeTheme).toBeVisible()

      await page.getByRole('button', { name: 'Toggle light and dark mode' }).click()

      await expect(page.getByTestId('game-board')).toBeVisible()
      await expect(page.getByText('Waiting for player')).toBeVisible()

      const passTurnButton = page.getByTestId('pass-turn-button')
      await expect(passTurnButton).toBeEnabled()
      await passTurnButton.click()

      await expect(page.getByTestId('game-board')).toBeVisible()
      await expect(page.getByText('Waiting for player')).toBeVisible()
      await expect(page.getByText('Unexpected Application Error')).toHaveCount(0)
    })

    test('allows long-press reordering in bottom hand', async ({ page }) => {
      await expect(page.getByTestId('game-board')).toBeVisible()

      const initialOrder = await getBottomHandInstanceOrder(page)
      test.skip(initialOrder.length <= 1, 'Seeded TEST1 hand must contain at least two cards for reorder validation.')

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

      await page.mouse.move(draggedBox.x + draggedBox.width / 2, draggedBox.y + draggedBox.height / 2)
      await page.mouse.down()
      await page.waitForTimeout(320)
      await page.mouse.move(secondBox.x + secondBox.width * 0.85, secondBox.y + secondBox.height / 2)
      await page.mouse.up()

      const nextOrder = await getBottomHandInstanceOrder(page)
      expect(nextOrder[0]).toBe(secondCardInstanceId)
      expect(nextOrder[1]).toBe(firstCardInstanceId)
    })
  })

})
