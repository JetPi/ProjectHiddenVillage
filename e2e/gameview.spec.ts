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

// The hand keeps changing while the initial deal / mulligan re-draw animation runs: cards arrive, the
// row re-lays out and card rects move. Measuring a card before the row settles makes the press land
// between cards (or on a stale rect), which silently drops the drag - so wait for two identical
// samples of the row order and of the first card's rect before starting the gesture.
async function waitForBottomHandToSettle(page: Page): Promise<string[]> {
  let previousSample = ''

  for (let attempt = 0; attempt < 40; attempt += 1) {
    const order = await getBottomHandInstanceOrder(page)
    const firstInstanceId = order[0]
    const firstBox = firstInstanceId
      ? await page.locator(`[data-testid="bottom-hand-card-${firstInstanceId}"]`).boundingBox()
      : null
    const sample = `${order.join(',')}|${
      firstBox ? `${Math.round(firstBox.x)}:${Math.round(firstBox.y)}:${Math.round(firstBox.width)}` : 'none'
    }`

    if (order.length >= 2 && firstBox !== null && sample === previousSample) {
      return order
    }

    previousSample = sample
    await page.waitForTimeout(200)
  }

  return getBottomHandInstanceOrder(page)
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

      const initialOrder = await waitForBottomHandToSettle(page)
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
        // Give the dragged card a frame to settle at the drop position before releasing: the reorder is
        // committed from the pointer-move pipeline, and an immediate release can outrun that frame.
        await page.waitForTimeout(120)
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

    test('closing the card details overlay does not trap the game in a drag state', async () => {
      await expect(page.getByTestId('game-board')).toBeVisible()

      const instanceOrder = await getBottomHandInstanceOrder(page)
      expect(instanceOrder.length).toBeGreaterThanOrEqual(1)

      const handCard = page.locator(`[data-testid="bottom-hand-card-${instanceOrder[0]}"]`)
      await handCard.hover()

      const openDetailsButton = handCard.getByRole('button', { name: 'Open card details' })
      await expect(openDetailsButton).toBeVisible()
      await openDetailsButton.click()

      const detailsDialog = page.getByRole('dialog')
      await expect(detailsDialog).toBeVisible()

      // Click a spot on the dimmed details-overlay backdrop that sits over the
      // bottom hand row. This is how the player "clicks back in" after reading a
      // card; it must only dismiss the overlay and never start a hand-card drag.
      const handCards = page.locator('[data-testid="bottom-hand-row"] [data-hand-instance-id]')
      const lastHandCardBox = await handCards.last().boundingBox()
      expect(lastHandCardBox).not.toBeNull()
      if (lastHandCardBox) {
        await page.mouse.click(
          lastHandCardBox.x + lastHandCardBox.width / 2,
          lastHandCardBox.y + lastHandCardBox.height / 2,
        )
      }

      await expect(detailsDialog).toHaveCount(0)

      // The dismissed overlay must not have left a hand card lifted/stuck in the
      // reorder drag visual state (fixed positioning is applied while dragging).
      const stuckDragState = await handCards.evaluateAll((nodes) =>
        nodes.some((node) => (node as HTMLElement).style.position === 'fixed'))
      expect(stuckDragState).toBe(false)
      expect(await page.evaluate(() => document.body.style.cursor)).not.toBe('grabbing')

      // The game must still accept interactions on the same card afterwards.
      await handCard.hover()
      await expect(openDetailsButton).toBeVisible()
      await openDetailsButton.click()
      await expect(detailsDialog).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(detailsDialog).toHaveCount(0)
    })
  })
})
