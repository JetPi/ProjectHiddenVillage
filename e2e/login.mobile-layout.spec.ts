import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

const PHONE_VIEWPORT = { width: 390, height: 844 }
const NARROW_VIEWPORT = { width: 320, height: 568 }
const MIN_TOUCH_SAFE_FONT_SIZE = 16

/**
 * The login view is the first screen every phone visitor sees, so it is the one place where a sideways scroll or a
 * control parked outside the viewport costs players outright. These assertions are viewport-shaped on purpose: they
 * pin the layout contract, not the markup that happens to satisfy it.
 */
test.describe('login view on a phone', () => {
  test.describe.configure({ timeout: 90_000 })

  test('the form stacks and every action can be scrolled to', async ({ page }) => {
    await openLoginView(page, PHONE_VIEWPORT)
    await expectNoHorizontalOverflow(page)

    await expect(page.getByRole('button', { name: 'Find Match' })).toBeInViewport()

    await page.getByRole('radio', { name: 'Join or Host' }).click()
    await expectNoHorizontalOverflow(page)

    for (const action of ['Join', 'Host']) {
      const button = page.getByRole('button', { name: action, exact: true })
      await button.scrollIntoViewIfNeeded()
      await expect(button).toBeInViewport()
    }

    // The invite sits below the panel, so reaching it is only possible while the shell itself scrolls.
    const invite = page.getByTestId('login-discord-invite')
    await invite.scrollIntoViewIfNeeded()
    await expect(invite).toBeInViewport()
  })

  test('controls carry a 16px font so focusing one does not zoom the page', async ({ page }) => {
    await openLoginView(page, PHONE_VIEWPORT)

    expect(await controlFontSize(page, '#displayName')).toBeGreaterThanOrEqual(MIN_TOUCH_SAFE_FONT_SIZE)

    await page.getByRole('radio', { name: 'Starter Decks' }).click()
    expect(await controlFontSize(page, '#deckOptions')).toBeGreaterThanOrEqual(MIN_TOUCH_SAFE_FONT_SIZE)
    expect(await controlFontSize(page, '#quickmatchRuleset')).toBeGreaterThanOrEqual(MIN_TOUCH_SAFE_FONT_SIZE)
  })

  test('a 320px viewport still fits the form', async ({ page }) => {
    await openLoginView(page, NARROW_VIEWPORT)
    await expectNoHorizontalOverflow(page)

    await page.getByRole('radio', { name: 'Join or Host' }).click()
    await expectNoHorizontalOverflow(page)

    const host = page.getByRole('button', { name: 'Host', exact: true })
    await host.scrollIntoViewIfNeeded()
    await expect(host).toBeInViewport()
  })
})

async function openLoginView(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport)
  await page.goto('/')
  await expect(page.locator('#displayName')).toBeVisible({ timeout: 30_000 })
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflowPx = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  expect(overflowPx, `the page scrolls sideways by ${overflowPx}px`).toBeLessThanOrEqual(1)
}

async function controlFontSize(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
}
