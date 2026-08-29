import { expect, test } from '@playwright/test'

async function openReadyGameView(page: import('@playwright/test').Page): Promise<void> {
  const maxAttempts = 8

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await page.goto('/game/TEST1')

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

test.describe('GameView', () => {
  test.describe.configure({ timeout: 90_000 })

  test.beforeEach(async ({ page }) => {
    await openReadyGameView(page)
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
})
