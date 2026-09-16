import { expect, test } from '@playwright/test'

const AUTH_STORAGE_KEY = 'phv-auth-session'
const API_HOST = '127.0.0.1:3101'
/** Seeded development admin (`DevelopmentUserSeeder.SeedUserOneId`, IsCardCatalogAdmin: true). */
const ADMIN_USER_ID = '20000000-0000-0000-0000-000000000001'

const adminSession = {
  userId: ADMIN_USER_ID,
  username: 'test-user-1',
  email: 'test-user-1@hiddenvillage.local',
  accessToken: 'dev-bypass-token',
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
}

/**
 * The card editor is where the authoring UI gets dense: a scrollable pane, reorderable effect cards and a
 * form panel per concern. These are the invariants that used to break - the pane clipped dropdown lists,
 * the effect header sliced its own controls with `overflow-hidden`, and every level drew another card
 * box. Measured against the real DOM because the symptoms are purely geometric.
 */
test('admin card editor keeps dropdowns, headers and sections inside their containers', async ({ browser }) => {
  // A desktop-width rail (the seeded admin runs ~1920 wide) must keep the header on a single line; at
  // narrower widths the groups wrap instead of being sliced, which the overflow checks below still pin.
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })

  // The development auth bypass identifies the caller by header, and the session keeps the client signed in.
  await context.route('**/*', (route) => {
    if (route.request().url().includes(API_HOST)) {
      return route.continue({
        headers: { ...route.request().headers(), 'X-Dev-User-Id': ADMIN_USER_ID },
      })
    }

    return route.continue()
  })
  await context.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session))
    },
    { key: AUTH_STORAGE_KEY, session: adminSession },
  )

  const page = await context.newPage()
  const viewport = page.viewportSize()
  expect(viewport).not.toBeNull()

  await page.goto('/admin/cards')

  // The dotnet API (migrations + seeding) comes up after the Vite dev server Playwright pings, so retry
  // until the catalogue loads instead of asserting on the first fetch.
  let tileCount = 0
  for (let attempt = 0; attempt < 20 && tileCount === 0; attempt += 1) {
    await page.waitForTimeout(3000)
    tileCount = await page.locator('li button').count()
    if (tileCount === 0) {
      await page.reload()
    }
  }
  expect(tileCount, 'card list never loaded (API not reachable)').toBeGreaterThan(0)

  await page.locator('#card-admin-search').fill('Shisui')
  const firstTile = page.locator('li button').first()
  await expect(firstTile).toBeVisible({ timeout: 15_000 })
  await firstTile.click()

  // Effects start collapsed; expand one so the panels render.
  const expandButton = page.getByRole('button', { name: 'Expand effect' }).first()
  await expect(expandButton).toBeVisible({ timeout: 15_000 })
  await expandButton.click()
  await expect(page.getByText('Runtime Effect Type').first()).toBeVisible({ timeout: 10_000 })

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

  await context.close()
})
