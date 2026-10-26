import { expect, test } from '@playwright/test'
import type { APIRequestContext, Browser, Page, Route } from '@playwright/test'
import { createAdminSession } from './helpers/adminSession'
import { installDeckAdminMocks, MOCK_RULESETS } from './helpers/deckAdminMocks'

const AUTH_STORAGE_KEY = 'phv-auth-session'

type MockRestriction = { cardId: string; maxCopies: number }

type MockRuleset = {
  id: string
  key: string
  name: string
  isActive: boolean
  leaderCount: number
  nonLeaderCardCount: number
  maxCopiesPerNonLeaderCard: number
  requireLeaderColorMatch: boolean
  allowChakraCards: boolean
  allowSummonCards: boolean
  sortOrder: number
  cardRestrictions: MockRestriction[]
}

function corsHeaders(route: Route): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': route.request().headers()['origin'] ?? 'http://127.0.0.1:4173',
    'Access-Control-Allow-Credentials': 'true',
  }
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  })
}

async function openRulesetAdmin(
  browser: Browser,
  request: APIRequestContext,
): Promise<{ page: Page; rulesets: MockRuleset[]; requests: string[] }> {
  const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } })
  const adminSession = await createAdminSession(request)

  await context.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session))
    },
    { key: AUTH_STORAGE_KEY, session: adminSession },
  )

  const page = await context.newPage()
  const rulesets: MockRuleset[] = MOCK_RULESETS.map((ruleset) => ({
    ...ruleset,
    cardRestrictions: [...ruleset.cardRestrictions],
  }))
  const requests: string[] = []

  await installDeckAdminMocks(page)

  await page.route('**/api/deck-rulesets**', async (route) => {
    const method = route.request().method()

    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          ...corsHeaders(route),
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'content-type, authorization',
        },
      })
      return
    }

    const url = new URL(route.request().url())
    requests.push(`${method} ${url.pathname}`)
    const segments = url.pathname.split('/').filter((segment) => segment.length > 0)
    const rulesetId = segments.length > 2 ? decodeURIComponent(segments[2]) : null

    if (method === 'GET') {
      const payload = url.pathname.endsWith('/all')
        ? rulesets
        : rulesets.filter((ruleset) => ruleset.isActive)

      await fulfillJson(route, 200, payload)
      return
    }

    if (method === 'POST') {
      const body = route.request().postDataJSON() as Omit<MockRuleset, 'id'>
      const created: MockRuleset = { id: `ruleset-created-${rulesets.length}`, ...body }
      rulesets.push(created)
      await fulfillJson(route, 201, created)
      return
    }

    if (method === 'PUT' && rulesetId) {
      const body = route.request().postDataJSON() as Omit<MockRuleset, 'id' | 'key'>
      const index = rulesets.findIndex((ruleset) => ruleset.id === rulesetId)

      if (index < 0) {
        await fulfillJson(route, 404, 'Ruleset not found.')
        return
      }

      rulesets[index] = { ...rulesets[index], ...body }
      await fulfillJson(route, 200, rulesets[index])
      return
    }

    if (method === 'DELETE' && rulesetId) {
      const index = rulesets.findIndex((ruleset) => ruleset.id === rulesetId)

      if (index < 0) {
        await fulfillJson(route, 404, 'Ruleset not found.')
        return
      }

      const remainingActive = rulesets.filter(
        (ruleset) => ruleset.id !== rulesetId && ruleset.isActive,
      )

      if (rulesets[index].isActive && remainingActive.length === 0) {
        await fulfillJson(route, 400, 'At least one ruleset must stay active.')
        return
      }

      rulesets.splice(index, 1)
      await route.fulfill({ status: 204, headers: corsHeaders(route) })
      return
    }

    await route.continue()
  })

  await page.goto('/admin/rulesets')
  await expect(page.getByTestId('admin-ruleset-item').first()).toBeVisible({ timeout: 30_000 })

  return { page, rulesets, requests }
}

function rulesetRailItem(page: Page, key: string) {
  return page.locator(`[data-testid="admin-ruleset-item"][data-ruleset-key="${key}"]`)
}

test('the ruleset admin creates, edits, deactivates and deletes a format', async ({ browser, request }) => {
  const { page, rulesets, requests } = await openRulesetAdmin(browser, request)

  await expect(rulesetRailItem(page, 'standard')).toBeVisible()
  await expect(rulesetRailItem(page, 'pre-release')).toBeVisible()

  await rulesetRailItem(page, 'standard').click()
  await expect(page.getByTestId('admin-ruleset-key')).toBeDisabled()
  await expect(page.getByTestId('admin-ruleset-name')).toHaveValue('Standard')

  await page.getByTestId('admin-ruleset-new').click()
  await page.getByTestId('admin-ruleset-key').fill('draft-format')
  await page.getByTestId('admin-ruleset-name').fill('Draft Format')
  await page.getByTestId('admin-ruleset-card-count').fill('40')
  await page.getByTestId('admin-ruleset-max-copies').fill('2')

  await page.getByTestId('admin-ruleset-restriction-card-id').fill('C-003')
  await page.getByTestId('admin-ruleset-restriction-add').click()
  await expect(page.getByTestId('admin-ruleset-restriction').first()).toHaveAttribute('data-card-id', 'C-003')
  await page.getByTestId('admin-ruleset-restriction-max').first().fill('1')

  await page.getByTestId('admin-ruleset-save').click()
  await expect.poll(() => requests.filter((entry) => entry === 'POST /api/deck-rulesets').length).toBe(1)
  await expect(rulesetRailItem(page, 'draft-format')).toBeVisible()

  const created = rulesets.find((ruleset) => ruleset.key === 'draft-format')
  expect(created?.nonLeaderCardCount).toBe(40)
  expect(created?.maxCopiesPerNonLeaderCard).toBe(2)
  expect(created?.cardRestrictions).toEqual([{ cardId: 'C-003', maxCopies: 1 }])

  await rulesetRailItem(page, 'draft-format').click()
  await page.getByTestId('admin-ruleset-name').fill('Draft Format Updated')
  await page.getByTestId('admin-ruleset-active').uncheck()
  await page.getByTestId('admin-ruleset-save').click()

  await expect
    .poll(() => requests.filter((entry) => entry.startsWith('PUT /api/deck-rulesets/')).length)
    .toBe(1)
  await expect(rulesetRailItem(page, 'draft-format')).toHaveAttribute('data-active', 'false')
  expect(rulesets.find((ruleset) => ruleset.key === 'draft-format')?.name).toBe('Draft Format Updated')

  page.once('dialog', (dialog) => {
    void dialog.accept()
  })
  await rulesetRailItem(page, 'draft-format').click()
  await page.getByTestId('admin-ruleset-delete').click()

  await expect
    .poll(() => requests.filter((entry) => entry.startsWith('DELETE /api/deck-rulesets/')).length)
    .toBe(1)
  await expect(rulesetRailItem(page, 'draft-format')).toHaveCount(0)
})
