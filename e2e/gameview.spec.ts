import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  advanceToMulliganPromptIfNeeded,
  closeMultiplayerPages,
  countTravelingCardElements,
  fetchGameState,
  getBottomHandInstanceOrder,
  openMultiplayerPages,
  resolveAllMulliganPrompts,
  resolveHandCardDragPressPoint,
  resolvePromptViaHub,
  resolveStartingPromptOwner,
  setupMultiplayerGame,
  waitForBottomHandToSettle,
} from './helpers/gameviewMultiplayerHelpers'
import type { MultiplayerPages, MultiplayerSetup } from './helpers/gameviewMultiplayerHelpers'

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

      // The board is only usable once the engine has walked the opening into a MainPhase and the last draw has
      // landed: before that the deal/draw batch keeps changing the hand, which races any measured gesture (that
      // race is what made the drag test intermittently fail to arm).
      await expect.poll(async () => {
        const state = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
        return state.phase
      }, { timeout: 60_000 }).toBe('MainPhase')

      // Nothing may still be mid-flight: a card left marked as travelling would be stuck transformed, or stuck
      // hidden behind the frame the flight uses before it starts.
      await expect.poll(async () => await countTravelingCardElements(page), { timeout: 30_000 }).toBe(0)
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

      // One gesture, no retry loop: hover first so the overlay is in its real state, then press a point that is
      // not one of its controls (a press on a control is deliberately not a drag).
      await page.mouse.move(draggedBox.x + draggedBox.width / 2, draggedBox.y + draggedBox.height / 2)
      await page.waitForTimeout(180)
      const pressPoint = await resolveHandCardDragPressPoint(page, firstCardInstanceId)
      expect(pressPoint, 'no non-interactive point on the hand card: a drag cannot be started').not.toBeNull()
      if (!pressPoint) {
        return
      }

      await page.mouse.move(pressPoint.x, pressPoint.y)
      await page.mouse.down()
      await page.waitForTimeout(120)
      await page.mouse.move(secondBox.x + secondBox.width + 24, pressPoint.y)
      // Motion commits the new order from the pointer-move pipeline; let it land before releasing.
      await page.waitForTimeout(120)
      await page.mouse.up()
      await page.waitForTimeout(160)

      const nextOrder = await getBottomHandInstanceOrder(page)
      const firstIndex = nextOrder.indexOf(firstCardInstanceId)
      const secondIndex = nextOrder.indexOf(secondCardInstanceId)

      expect(firstIndex, 'the dragged card must still be in the hand').toBeGreaterThanOrEqual(0)
      expect(secondIndex, 'the card it was dragged past must still be in the hand').toBeGreaterThanOrEqual(0)
      expect(firstIndex, 'the dragged card must end up after the card it was dragged past').toBeGreaterThan(secondIndex)
    })

    /**
     * Regression for the measured hand-drag defect (see `plans/board-position-animation-diagnosis.md`): the
     * reorder engine lifted the card with `position: fixed` while its Motion slot parent carried a `transform`,
     * so the slot became the containing block and the card was drawn 566px below / 645px right of the pointer
     * (off-screen). One gesture, no retry loop: if the card stops tracking the pointer, or has to be positioned
     * with `fixed` to do it, this fails.
     */
    test('the dragged hand card tracks the pointer and never leaves the row', async () => {
      await expect(page.getByTestId('game-board')).toBeVisible()

      const initialOrder = await waitForBottomHandToSettle(page)
      expect(initialOrder.length).toBeGreaterThanOrEqual(2)

      const firstInstanceId = initialOrder[0]
      const draggedCard = page.locator(`[data-testid="bottom-hand-card-${firstInstanceId}"]`)
      const draggedBox = await draggedCard.boundingBox()
      expect(draggedBox).not.toBeNull()
      if (!draggedBox) {
        return
      }

      // Hover the card first so the hover overlay is in its real (revealed) state, then pick a press point
      // that is *not* an interactive control: a mouse press that lands on a control defers the drag instead of
      // arming it, which is intended, but it makes a fixed centre-of-card press a coin flip.
      const hoverX = draggedBox.x + draggedBox.width / 2
      const hoverY = draggedBox.y + draggedBox.height / 2
      await page.mouse.move(hoverX, hoverY)
      await page.waitForTimeout(180)

      const pressPoint = await resolveHandCardDragPressPoint(page, firstInstanceId)

      expect(pressPoint, 'no non-interactive point on the hand card: a drag cannot be started at all').not.toBeNull()
      if (!pressPoint) {
        return
      }

      const rowBox = await page.locator('[data-testid="bottom-hand-row"]').boundingBox()
      const pointerX = rowBox
        ? Math.min(pressPoint.x + draggedBox.width * 1.4, rowBox.x + rowBox.width - 12)
        : pressPoint.x + draggedBox.width * 1.4
      const pointerY = pressPoint.y

      await page.mouse.move(pressPoint.x, pressPoint.y)
      await page.mouse.down()
      // A mouse press on a non-interactive spot arms the drag synchronously; give the lift a frame to apply.
      await page.waitForTimeout(120)
      await page.mouse.move(pointerX, pointerY)
      await page.waitForTimeout(120)

      const snapshot = await page.evaluate(({ instanceId, currentPointerX, currentPointerY }) => {
        const row = document.querySelector<HTMLElement>('[data-testid="bottom-hand-row"]')
        const dragged = document.querySelector<HTMLElement>(`[data-hand-instance-id="${instanceId}"]`)
        const rowRect = row?.getBoundingClientRect() ?? null
        const rowCards = row ? Array.from(row.querySelectorAll<HTMLElement>('[data-hand-instance-id]')) : []
        const draggedRect = dragged?.getBoundingClientRect() ?? null

        return {
          draggedPosition: dragged ? window.getComputedStyle(dragged).position : null,
          draggedCentreX: draggedRect ? draggedRect.left + draggedRect.width / 2 : null,
          draggedCentreY: draggedRect ? draggedRect.top + draggedRect.height / 2 : null,
          pointerX: currentPointerX,
          pointerY: currentPointerY,
          rowCardCount: rowCards.length,
          cards: rowCards.map((card) => {
            const box = card.getBoundingClientRect()
            const style = window.getComputedStyle(card)
            return {
              id: card.getAttribute('data-hand-instance-id'),
              centreY: box.top + box.height / 2,
              opacity: style.opacity,
              visibility: style.visibility,
              insideRowBand: rowRect
                ? box.top >= rowRect.top - 4 && box.bottom <= rowRect.bottom + 4
                : true,
            }
          }),
        }
      }, { instanceId: firstInstanceId, currentPointerX: pointerX, currentPointerY: pointerY })

      await page.mouse.up()
      await page.waitForTimeout(220)

      expect(snapshot.draggedPosition, 'the lifted card must not rely on position: fixed').not.toBe('fixed')
      expect(snapshot.rowCardCount, 'the row must keep every card while one is being dragged').toBe(initialOrder.length)
      expect(snapshot.cards.filter((card) => card.opacity !== '1'), 'no hand card may fade mid-drag').toEqual([])
      expect(snapshot.cards.filter((card) => card.visibility !== 'visible'), 'no hand card may hide mid-drag').toEqual([])
      expect(snapshot.cards.filter((card) => !card.insideRowBand), 'no hand card may leave the row band').toEqual([])

      // The card must follow the pointer's *movement*: the press point is deliberately off-centre (it has to
      // avoid the hover overlay's controls), so the expectation is the card's own start centre displaced by the
      // pointer delta, not the pointer position itself.
      const expectedCentreX = draggedBox.x + draggedBox.width / 2 + (pointerX - pressPoint.x)
      const expectedCentreY = draggedBox.y + draggedBox.height / 2 + (pointerY - pressPoint.y)

      expect(snapshot.draggedCentreX, 'dragged card centre x').not.toBeNull()
      expect(snapshot.draggedCentreY, 'dragged card centre y').not.toBeNull()
      if (snapshot.draggedCentreX !== null && snapshot.draggedCentreY !== null) {
        expect(Math.abs(snapshot.draggedCentreX - expectedCentreX), 'dragged card must follow the pointer horizontally').toBeLessThanOrEqual(4)
        expect(Math.abs(snapshot.draggedCentreY - expectedCentreY), 'dragged card must keep the pointer height').toBeLessThanOrEqual(4)
      }
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

      // The details panel scrolls with the shared themed scrollbar - the same `.themed-scrollbar`
      // the admin panes use - so the game view never falls back to the chunky OS default scrollbar.
      const detailsScrollContainer = detailsDialog.locator('.themed-scrollbar')
      await expect(detailsScrollContainer).toHaveCount(1)
      expect(
        await detailsScrollContainer.evaluate(
          (node) => window.getComputedStyle(node).getPropertyValue('scrollbar-width'),
        ),
      ).toBe('thin')

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
