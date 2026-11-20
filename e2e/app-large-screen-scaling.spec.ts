import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * The auth screens are rem-based end to end, so they opt into the app-wide large-screen scale through
 * `PageShell scaleToViewport`: the root font size grows with the window and every size on the page - type, padding and
 * the `max-w-*` panel widths - grows with it. The game view deliberately does not opt in; it has its own px-token
 * ladder (`gameview.large-screen-layout.spec.ts` pins that one).
 */
const LAPTOP = { width: 1280, height: 720 }
const DESKTOP = { width: 2560, height: 1440 }
const FOUR_K = { width: 3840, height: 2160 }

// The clamp is `16px` at 1280 and below and caps at `28px`. A little tolerance covers sub-pixel rounding.
const ROOT_FONT_FLOOR_PX = 16
const ROOT_FONT_CAP_PX = 28

test.describe('app screens on large viewports', () => {
  test.describe.configure({ timeout: 120_000 })

  test('the login view grows its type and its panel with the window', async ({ page }) => {
    await openLogin(page, LAPTOP)
    const laptop = await measure(page)

    await page.setViewportSize(DESKTOP)
    await page.waitForTimeout(250)
    const desktop = await measure(page)

    await page.setViewportSize(FOUR_K)
    await page.waitForTimeout(250)
    const fourK = await measure(page)

    // Laptops (and every phone spec) keep the original 16px root, so nothing about the untuned layout moves.
    expect(laptop.rootFontPx).toBeCloseTo(ROOT_FONT_FLOOR_PX, 0)
    expect(desktop.rootFontPx).toBeGreaterThan(laptop.rootFontPx * 1.2)
    expect(fourK.rootFontPx).toBeGreaterThan(desktop.rootFontPx)
    expect(fourK.rootFontPx).toBeLessThanOrEqual(ROOT_FONT_CAP_PX + 0.5)

    // The panel is rem-based, so it has to widen with the root font rather than staying a postage stamp in the middle.
    expect(desktop.controlWidth).toBeGreaterThan(laptop.controlWidth * 1.2)
    expect(fourK.controlWidth).toBeGreaterThan(desktop.controlWidth)

    // And scaling must not introduce a sideways scroll at any of the three rungs.
    for (const rung of [laptop, desktop, fourK]) {
      expect(rung.horizontalOverflow).toBeLessThanOrEqual(1)
    }
  })
})

async function openLogin(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport)
  await page.goto('/')
  await expect(page.locator('#displayName')).toBeVisible({ timeout: 30_000 })
}

async function measure(page: Page): Promise<{
  rootFontPx: number
  controlWidth: number
  horizontalOverflow: number
}> {
  return page.evaluate(() => {
    const control = document.querySelector('#displayName')
    const controlRect = control?.getBoundingClientRect() ?? null

    return {
      rootFontPx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
      controlWidth: controlRect?.width ?? 0,
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
    }
  })
}
