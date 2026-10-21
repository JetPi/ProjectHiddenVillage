import { expect, test } from '@playwright/test'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { createAdminSession } from './helpers/adminSession'

const AUTH_STORAGE_KEY = 'phv-auth-session'

/**
 * Signs in as the seeded admin (a real login, so authorised calls carry a token the server can validate - see
 * `createAdminSession`) and waits for the catalogue to render.
 */
async function openAdminCatalogue(
  browser: Browser,
  request: APIRequestContext,
  viewport: { width: number; height: number },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport })
  const adminSession = await createAdminSession(request)

  await context.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session))
    },
    { key: AUTH_STORAGE_KEY, session: adminSession },
  )

  const page = await context.newPage()

  await page.goto('/admin/cards')

  // `globalSetup` has already waited for /api/health, so this is only about the client rendering the
  // catalogue: an auto-retrying assertion instead of 20 x 3 s of sleeping and reloading.
  await expect
    .poll(async () => await page.locator('li button').count(), { timeout: 30_000 })
    .toBeGreaterThan(0)

  return { context, page }
}

/**
 * The card editor is where the authoring UI gets dense: a scrollable pane, reorderable effect cards and a
 * form panel per concern. These are the invariants that used to break - the pane clipped dropdown lists,
 * the effect header sliced its own controls with `overflow-hidden`, and every level drew another card
 * box. Measured against the real DOM because the symptoms are purely geometric.
 */
test('admin card editor keeps dropdowns, headers and sections inside their containers', async ({ browser, request }) => {
  // A desktop-width rail (the seeded admin runs ~1920 wide) must keep the header on a single line; at
  // narrower widths the groups wrap instead of being sliced, which the overflow checks below still pin.
  const { context, page } = await openAdminCatalogue(browser, request, { width: 1600, height: 900 })
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()

  await page.locator('#card-admin-search').fill('Shisui')
  const firstTile = page.locator('li button').first()

  // The search is a server query now (debounced), so the first tile is visible before the filtered page arrives:
  // waiting for it to actually carry the term is what proves the rail re-queried instead of clicking whatever the
  // unfiltered list happened to show first.
  await expect(firstTile).toContainText('Shisui', { timeout: 15_000 })
  // The same tile component carries the card's colour as its outline on this screen too. The tone lives on the
  // tile wrapper (the remove-copy control is a sibling of the card button), not on the button itself.
  await expect(page.locator('[data-testid="catalog-card-tile"]').first())
    .toHaveAttribute('data-color-tone', /^(red|blue|green|neutral)$/)
  await firstTile.click()

  // Selecting a card brings the primary-colour outline back; the tile's own colour stays its background.
  await expect(page.locator('[data-testid="catalog-card-tile"][data-marked="true"]')).toHaveCount(1)

  // Effects start collapsed; expand one so the panels render.
  const expandButton = page.getByRole('button', { name: 'Expand effect' }).first()
  await expect(expandButton).toBeVisible({ timeout: 15_000 })
  await expandButton.click()
  await expect(page.getByText('Runtime Effect Type').first()).toBeVisible({ timeout: 10_000 })

  // 0. Predicate controls are a single inline row at desktop width. `CardAdminSelect` owns a full-width
  //    wrapper, so putting the width classes on its trigger left every control claiming a whole line.
  await page.getByRole('button', { name: 'Add Target Rule' }).first().click()
  await page.getByRole('button', { name: 'Add Predicate' }).first().click()

  const predicateControls = page.getByTestId('predicate-controls').first()
  await expect(predicateControls).toBeVisible()
  const predicateControlTops = await predicateControls.evaluate((element) =>
    Array.from(element.children).map((child) => Math.round(child.getBoundingClientRect().top)),
  )
  expect(predicateControlTops.length, 'a predicate should have property, operator and value controls').toBe(3)
  const predicateTopSpread = Math.max(...predicateControlTops) - Math.min(...predicateControlTops)
  expect(predicateTopSpread, 'predicate controls should share one line').toBeLessThanOrEqual(8)

  // 0b. The conditions picker offers the catalogue's keyword conditions, not the old engine flag list.
  const conditionSelect = page.getByRole('combobox', { name: 'Select a condition to add...' })
  await conditionSelect.click()
  await expect(page.getByRole('option', { name: 'Rush' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Summon Requirements' })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Named Card Reference' })).toBeVisible()
  await page.keyboard.press('Escape')

  // 1. Sections are not cards: only the effect card itself draws a rounded, filled surface.
  const sectionClassNames = await page.evaluate(() =>
    Array.from(document.querySelectorAll('details')).map((element) => element.className),
  )
  expect(sectionClassNames.length).toBeGreaterThan(0)
  const sectionBoxes = sectionClassNames.filter(
    (className) => className.includes('rounded-lg') || className.includes('bg-[var(--surface-muted)]'),
  )
  expect(sectionBoxes, `sections still drawing a box: ${sectionBoxes.join(' | ')}`).toHaveLength(0)

  // 2. The effect header stays a single line on a normal rail, without overflowing or slicing controls.
  const headerRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('input[placeholder^="Effect "]'))
      .map((input) => input.parentElement)
      .filter((row): row is HTMLElement => row !== null)

    return rows.map((row) => {
      const rowRect = row.getBoundingClientRect()
      const controls = Array.from(row.children).map((child) => child.getBoundingClientRect())
      // Two lines of controls would spread the row's content well past a single control height.
      const verticalSpread = Math.round(
        Math.max(...controls.map((rect) => rect.bottom)) - Math.min(...controls.map((rect) => rect.top)),
      )

      return {
        height: Math.round(rowRect.height),
        verticalSpread,
        overflowX: getComputedStyle(row).overflowX,
        overflow: row.scrollWidth - row.clientWidth,
        sliced: controls.filter((rect) => rect.right > rowRect.right + 1 || rect.left < rowRect.left - 1).length,
      }
    })
  })
  expect(headerRows.length).toBeGreaterThan(0)
  for (const row of headerRows) {
    expect(row.overflowX, 'the header row must not clip its own controls').not.toBe('hidden')
    expect(row.overflow, `header row overflows by ${row.overflow}px`).toBeLessThanOrEqual(1)
    expect(row.sliced, 'header controls sit outside their row').toBe(0)
    expect(row.height, 'the effect header should stay one line tall').toBeLessThanOrEqual(44)
    expect(row.verticalSpread, 'header controls should share a single line').toBeLessThanOrEqual(44)
  }

  // 3. Opening a dropdown only opens it, and the list escapes every clipping ancestor.
  const panelSelect = page.locator('details:has-text("Execution Target") [role="combobox"]').first()
  await expect(panelSelect).toBeVisible()
  const valueBeforeOpening = await panelSelect.innerText()
  await panelSelect.click()

  const listbox = page.getByTestId('admin-select-listbox')
  await expect(listbox).toBeVisible()
  expect(await panelSelect.innerText(), 'the opening click must not choose an option').toBe(valueBeforeOpening)

  const geometry = await listbox.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return {
      isPortalled: element.parentElement === document.body,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      optionCount: element.querySelectorAll('[role="option"]').length,
    }
  })

  expect(geometry.isPortalled, 'the listbox must be portalled out of the scroll container').toBe(true)
  expect(geometry.optionCount).toBeGreaterThan(0)
  expect(geometry.top, 'listbox starts above the viewport').toBeGreaterThanOrEqual(-1)
  expect(geometry.left, 'listbox starts left of the viewport').toBeGreaterThanOrEqual(-1)
  expect(geometry.bottom, 'listbox is clipped at the bottom of the viewport').toBeLessThanOrEqual(viewport!.height + 1)
  expect(geometry.right, 'listbox is clipped at the right of the viewport').toBeLessThanOrEqual(viewport!.width + 1)

  // 4. Choosing takes a second click.
  await listbox.getByRole('option').nth(1).click()
  await expect(listbox).toBeHidden()

  // 5. Flags can be toggled: the switch surface used to swallow these clicks (and a card-wide drag grabbed
  //    them for itself), which made chakra costs impossible to switch on.
  const chakraToggle = page.getByRole('checkbox', { name: 'Chakra Cost Enabled' }).first()
  const chakraChip = chakraToggle.locator('xpath=../..')
  const chakraToggleSurface = chakraToggle.locator('..')
  const chakraAmountInput = chakraChip.locator('input[type="number"]')
  await expect(chakraAmountInput).toBeDisabled()
  await chakraToggleSurface.click()
  await expect(chakraToggle).toBeChecked()
  await expect(chakraAmountInput).toBeEnabled()

  // 6. Only the drag handle starts a drag, it hands the browser a labelled ghost, and the drop reorders.
  const dragConfig = await page.evaluate(() => {
    const handle = document.querySelector('[data-testid="effect-drag-handle"]')
    if (!handle) {
      return null
    }

    let draggableAncestors = 0
    let node: Element | null = handle.parentElement
    while (node && node !== document.body) {
      if ((node as HTMLElement).draggable) {
        draggableAncestors += 1
      }
      node = node.parentElement
    }

    const ghosts: string[] = []
    ;(window as unknown as { __dragGhosts: string[] }).__dragGhosts = ghosts
    const original = DataTransfer.prototype.setDragImage
    DataTransfer.prototype.setDragImage = function (image: Element, x: number, y: number) {
      ghosts.push((image as HTMLElement).textContent ?? '')
      return original.call(this, image, x, y)
    }

    return { handleDraggable: (handle as HTMLElement).draggable, draggableAncestors }
  })
  expect(dragConfig?.handleDraggable, 'the drag handle must be the drag source').toBe(true)
  expect(dragConfig?.draggableAncestors, 'no ancestor of the handle may start a drag').toBe(0)

  const effectIds = page.locator('input[placeholder^="Effect "]')
  const idsBefore = await effectIds.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
  expect(idsBefore.length, 'the fixture card needs at least two effects to reorder').toBeGreaterThan(1)

  const effectCards = page.getByTestId('effect-card')

  // Headless Chromium will not start an HTML5 drag from synthetic mouse moves, so the native gesture is
  // replaced by a real `DragEvent` sequence (same events React's handlers receive for a mouse drag).
  const dispatchDragEvent = (type: string, testId: string, index: number) =>
    page.evaluate(
      ({ eventType, targetTestId, targetIndex }) => {
        const nodes = document.querySelectorAll<HTMLElement>(`[data-testid="${targetTestId}"]`)
        const target = nodes[targetIndex]
        if (!target) {
          return false
        }

        const host = window as unknown as { __dragData?: DataTransfer }
        host.__dragData = host.__dragData ?? new DataTransfer()
        target.dispatchEvent(new DragEvent(eventType, { bubbles: true, cancelable: true, dataTransfer: host.__dragData }))
        return true
      },
      { eventType: type, targetTestId: testId, targetIndex: index },
    )

  expect(await dispatchDragEvent('dragstart', 'effect-drag-handle', 1)).toBe(true)
  await expect(effectCards.nth(1), 'the dragged card should be dimmed while the drag is live').toHaveClass(/opacity-60/)

  expect(await dispatchDragEvent('dragover', 'effect-card', 0)).toBe(true)
  await expect(effectCards.nth(0), 'the drop target should be highlighted').toHaveClass(/ring-2/)

  expect(await dispatchDragEvent('drop', 'effect-card', 0)).toBe(true)

  const ghosts = await page.evaluate(() => (window as unknown as { __dragGhosts?: string[] }).__dragGhosts ?? [])
  expect(ghosts.length, 'the drag must supply a custom drag image').toBeGreaterThan(0)
  expect(ghosts[0], 'the ghost should name the effect being dragged').toContain(idsBefore[1])

  const idsAfter = await effectIds.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
  expect(idsAfter, 'dragging the second effect onto the first should swap them').toEqual([
    idsBefore[1],
    idsBefore[0],
    ...idsBefore.slice(2),
  ])

  // The highlight and the dim must both be gone once the drag ends.
  expect(await dispatchDragEvent('dragend', 'effect-drag-handle', 1)).toBe(true)
  await expect(effectCards.nth(0)).not.toHaveClass(/ring-2/)
  await expect(effectCards.nth(0)).not.toHaveClass(/opacity-60/)

  const previewNodes = await page.evaluate(() => document.querySelectorAll('body > div[style*="top: -1000px"]').length)
  expect(previewNodes, 'the drag ghost node must not be left behind in the DOM').toBe(0)

  await context.close()
})

/**
 * Unsaved changes are the one thing this editor can lose silently: the pane is keyed by card id, so selecting
 * another card - or leaving the view - unmounts the draft with it. Each of those exits asks first instead.
 */
test('admin card editor warns before leaving a card with unsaved changes', async ({ browser, request }) => {
  const { context, page } = await openAdminCatalogue(browser, request, { width: 1600, height: 900 })

  const tiles = page.locator('li button')
  const firstTile = tiles.first()
  const secondTile = tiles.nth(1)
  await expect(firstTile).toBeVisible({ timeout: 15_000 })
  await firstTile.click()

  const artUrlField = page.locator('#card-admin-art-url')
  await expect(artUrlField).toBeVisible({ timeout: 15_000 })

  // Staging an art URL is the cheapest way to dirty the draft: it is always on screen, and on the update screen
  // nothing is sent while it is only staged.
  const stagedUrl = 'https://example.invalid/staged.png'
  await artUrlField.fill(stagedUrl)

  const unsavedPill = page.getByTestId('admin-unsaved-pill')
  const unsavedDialog = page.getByTestId('admin-unsaved-changes')
  await expect(unsavedPill).toBeVisible()

  // 1. Selecting another card asks first, and staying keeps both the card and its draft.
  await secondTile.click()
  await expect(unsavedDialog).toBeVisible()
  await page.getByRole('button', { name: 'Keep Editing' }).click()
  await expect(unsavedDialog).toBeHidden()
  await expect(artUrlField, 'staying must not remount the editor').toHaveValue(stagedUrl)

  // 2. Leaving the view is the same loss, and the router asks the same question before it navigates.
  await page.getByTestId('admin-add-card').click()
  await expect(unsavedDialog).toBeVisible()
  await page.getByRole('button', { name: 'Keep Editing' }).click()
  await expect(unsavedDialog).toBeHidden()
  await expect(page).toHaveURL(/\/admin\/cards$/)

  // 3. Saving is the third answer, and it has to be *the card's* save: a draft the server refuses must not let
  //    the exit through. A staged URL past the image column's limit is rejected server-side, which has to leave
  //    the author on the card with the draft still there and still unsaved.
  const refusedUrl = `https://example.invalid/${'a'.repeat(1200)}`
  await artUrlField.fill(refusedUrl)
  await secondTile.click()
  await expect(unsavedDialog).toBeVisible()
  await page.getByTestId('admin-unsaved-save').click()
  await expect(unsavedDialog).toBeHidden()
  await expect(artUrlField, 'a refused save must leave the draft alone').toHaveValue(refusedUrl)
  await expect(unsavedPill, 'a refused save is not a save').toBeVisible()

  // 4. Discarding goes through with it: the second card opens with a clean draft.
  await secondTile.click()
  await expect(unsavedDialog).toBeVisible()
  await page.getByTestId('admin-unsaved-discard').click()
  await expect(unsavedDialog).toBeHidden()
  await expect(artUrlField).toHaveValue('')
  await expect(unsavedPill).toBeHidden()

  await context.close()
})
