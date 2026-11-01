import { expect, test } from '@playwright/test'
import type { APIRequestContext, Browser, Page, Route } from '@playwright/test'
import { createAdminSession } from './helpers/adminSession'
import { installDeckAdminMocks, MOCK_RULESETS, MOCK_SET_CODES } from './helpers/deckAdminMocks'

const AUTH_STORAGE_KEY = 'phv-auth-session'

type MockRestriction = {
  matchType: 'Card' | 'Set'
  code: string
  maxCopies: number
}

type MockRuleset = {
  id: string
  key: string
  name: string
  isActive: boolean
  cardPoolMode: 'Open' | 'AllowList'
  availableInQuickMatch: boolean
  leaderCount: number
  nonLeaderCardCount: number
  maxCopiesPerNonLeaderCard: number
  requireLeaderColorMatch: boolean
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

    // The rule editor asks for the catalogue's set codes; without an explicit branch the generic GET below would
    // answer it with the ruleset list.
    if (method === 'GET' && url.pathname.endsWith('/card-pool/set-codes')) {
      await fulfillJson(route, 200, MOCK_SET_CODES)
      return
    }

    if (method === 'GET') {
      const payload = url.pathname.endsWith('/all')
        ? rulesets
        : rulesets.filter((ruleset) => ruleset.isActive)

      await fulfillJson(route, 200, payload)
      return
    }

    if (method === 'POST') {
      // The server owns the position: a new format is appended, so the body never carries one.
      const body = route.request().postDataJSON() as Omit<MockRuleset, 'id' | 'sortOrder'>
      const created: MockRuleset = {
        id: `ruleset-created-${rulesets.length}`,
        sortOrder: rulesets.length,
        ...body,
      }
      rulesets.push(created)
      await fulfillJson(route, 201, created)
      return
    }

    if (method === 'PUT' && url.pathname.endsWith('/deck-rulesets/order')) {
      const body = route.request().postDataJSON() as { rulesetIds: string[] }
      const byId = new Map(rulesets.map((ruleset) => [ruleset.id, ruleset]))
      const ordered = body.rulesetIds
        .map((rulesetId) => byId.get(rulesetId))
        .filter((ruleset): ruleset is MockRuleset => ruleset !== undefined)
      const rest = rulesets.filter((ruleset) => !body.rulesetIds.includes(ruleset.id))

      rulesets.splice(0, rulesets.length, ...ordered, ...rest)
      rulesets.forEach((ruleset, index) => {
        ruleset.sortOrder = index
      })

      await fulfillJson(route, 200, rulesets)
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
  // The key is derived from the name, so creating a format never means typing a slug.
  await page.getByTestId('admin-ruleset-name').fill('Draft Format')
  await expect(page.getByTestId('admin-ruleset-key')).toHaveValue('draft-format')
  await page.getByTestId('admin-ruleset-card-count').fill('40')
  await page.getByTestId('admin-ruleset-max-copies').fill('2')
  // The whole-game pool is edited in minutes; a new format starts at 30.
  await expect(page.getByTestId('admin-ruleset-player-pool-minutes')).toHaveValue('30')
  // A new format is quick-matchable by default; this one is deliberately kept out of the queue.
  await expect(page.getByTestId('admin-ruleset-quick-match')).toBeChecked()
  await page.getByTestId('admin-ruleset-quick-match').uncheck()

  await page.getByTestId('admin-ruleset-restriction-code').fill('C-003')
  await page.getByTestId('admin-ruleset-restriction-add').click()
  await expect(page.getByTestId('admin-ruleset-restriction').first()).toHaveAttribute('data-code', 'C-003')
  await expect(page.getByTestId('admin-ruleset-restriction').first()).toHaveAttribute('data-match-type', 'Card')
  await page.getByTestId('admin-ruleset-restriction-max').first().fill('1')

  await page.getByTestId('admin-ruleset-save').click()
  await expect.poll(() => requests.filter((entry) => entry === 'POST /api/deck-rulesets').length).toBe(1)
  await expect(rulesetRailItem(page, 'draft-format')).toBeVisible()

  const created = rulesets.find((ruleset) => ruleset.key === 'draft-format')
  expect(created?.nonLeaderCardCount).toBe(40)
  expect(created?.maxCopiesPerNonLeaderCard).toBe(2)
  expect(created?.cardRestrictions).toEqual([
    { matchType: 'Card', code: 'C-003', maxCopies: 1 },
  ])
  expect(created?.availableInQuickMatch).toBe(false)
  expect(created?.cardPoolMode).toBe('Open')

  await rulesetRailItem(page, 'draft-format').click()
  await expect(page.getByTestId('admin-ruleset-quick-match')).not.toBeChecked()
  await page.getByTestId('admin-ruleset-name').fill('Draft Format Updated')
  await page.getByTestId('admin-ruleset-active').uncheck()
  await page.getByTestId('admin-ruleset-quick-match').check()
  await page.getByTestId('admin-ruleset-save').click()

  await expect
    .poll(() => requests.filter((entry) => entry.startsWith('PUT /api/deck-rulesets/')).length)
    .toBe(1)
  await expect(rulesetRailItem(page, 'draft-format')).toHaveAttribute('data-active', 'false')
  expect(rulesets.find((ruleset) => ruleset.key === 'draft-format')?.name).toBe('Draft Format Updated')
  expect(rulesets.find((ruleset) => ruleset.key === 'draft-format')?.availableInQuickMatch).toBe(true)

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

test('dragging a format in the rail saves the new order', async ({ browser, request }) => {
  const { page, rulesets, requests } = await openRulesetAdmin(browser, request)

  await expect(page.getByTestId('admin-ruleset-item').nth(0)).toHaveAttribute('data-ruleset-key', 'standard')

  // No save button and no dialog: the handle moves the row, and the order is saved on its own.
  await page
    .getByTestId('admin-ruleset-drag-handle')
    .nth(1)
    .dragTo(page.getByTestId('admin-ruleset-row').nth(0))

  await expect(page.getByTestId('admin-ruleset-item').nth(0)).toHaveAttribute('data-ruleset-key', 'pre-release')
  await expect
    .poll(() => requests.filter((entry) => entry === 'PUT /api/deck-rulesets/order').length)
    .toBe(1)

  expect(rulesets.map((ruleset) => ruleset.key)).toEqual(['pre-release', 'standard'])
  expect(rulesets.map((ruleset) => ruleset.sortOrder)).toEqual([0, 1])
})

test('an allow-list format saves a set rule instead of a card rule', async ({ browser, request }) => {
  const { page, rulesets } = await openRulesetAdmin(browser, request)

  await page.getByTestId('admin-ruleset-new').click()
  await page.getByTestId('admin-ruleset-key').fill('allow-list')
  await page.getByTestId('admin-ruleset-name').fill('Allow List')

  // A closed pool has to allow something, so the save stays blocked until one rule is added.
  await page.getByTestId('admin-ruleset-pool-mode').selectOption('AllowList')
  await expect(page.getByTestId('admin-ruleset-validation')).toContainText('at least one rule')
  await expect(page.getByTestId('admin-ruleset-save')).toBeDisabled()

  await page.getByTestId('admin-ruleset-restriction-match-type').selectOption('Set')
  await page.getByTestId('admin-ruleset-restriction-code').fill('sample')
  await page.getByTestId('admin-ruleset-restriction-add').click()

  const rule = page.getByTestId('admin-ruleset-restriction').first()
  await expect(rule).toHaveAttribute('data-match-type', 'Set')
  await expect(rule).toHaveAttribute('data-code', 'SAMPLE')
  // A set rule allows at the format's copy cap by default, so the save unblocks without touching the cap field.
  await expect(page.getByTestId('admin-ruleset-save')).toBeEnabled()

  await page.getByTestId('admin-ruleset-save').click()
  await expect(rulesetRailItem(page, 'allow-list')).toBeVisible()

  const created = rulesets.find((ruleset) => ruleset.key === 'allow-list')
  expect(created?.cardPoolMode).toBe('AllowList')
  expect(created?.cardRestrictions).toEqual([
    { matchType: 'Set', code: 'SAMPLE', maxCopies: 4 },
  ])
})
