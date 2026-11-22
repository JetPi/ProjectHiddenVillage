import { expect, test } from '@playwright/test'
import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { createAdminSession } from './helpers/adminSession'

const AUTH_STORAGE_KEY = 'phv-auth-session'

type IExportedEffectsPayload = {
  kind: string
  version: number
  sourceCard: { id: string | null; displayName: string | null }
  conditions: string[]
  effects: Array<Record<string, unknown>>
}

/**
 * Opens the seeded card editor. `Shisui` is the card the existing card-editor spec already relies on for a
 * populated effect list, so the transfer spec shares that fixture instead of minting its own card.
 */
async function openSeededCardEditor(
  browser: Browser,
  request: APIRequestContext,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
  const adminSession = await createAdminSession(request)

  await context.addInitScript(
    ({ key, session }) => {
      window.localStorage.setItem(key, JSON.stringify(session))
    },
    { key: AUTH_STORAGE_KEY, session: adminSession },
  )

  const page = await context.newPage()
  await page.goto('/admin/cards')

  await expect
    .poll(async () => await page.locator('li button').count(), { timeout: 30_000 })
    .toBeGreaterThan(0)

  await page.locator('#card-admin-search').fill('Shisui')
  const firstTile = page.locator('li button').first()
  await expect(firstTile).toContainText('Shisui', { timeout: 15_000 })
  await firstTile.click()

  // The editor hydrates asynchronously; an expanded effect is what proves the draft has arrived.
  await expect(page.getByRole('button', { name: 'Expand effect' }).first()).toBeVisible({ timeout: 15_000 })

  return { context, page }
}

async function copyExportedEffects(page: Page): Promise<IExportedEffectsPayload> {
  await page.getByTestId('admin-effects-export').click()
  await expect(page.getByText('Effects copied to the clipboard.')).toBeVisible({ timeout: 10_000 })

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())

  return JSON.parse(clipboardText) as IExportedEffectsPayload
}

test('exporting copies a versioned effects payload that the import dialog accepts back', async ({ browser, request }) => {
  const { context, page } = await openSeededCardEditor(browser, request)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  const renderedEffectCount = await page.getByTestId('effect-card').count()
  expect(renderedEffectCount).toBeGreaterThan(0)
  await expect(page.getByTestId('admin-effects-export')).toBeEnabled()

  const payload = await copyExportedEffects(page)

  expect(payload.kind).toBe('phv.card-effects')
  expect(payload.version).toBe(1)
  expect(payload.effects).toHaveLength(renderedEffectCount)
  expect(payload.effects[0]).toHaveProperty('targetRules')
  expect(payload.effects[0]).toHaveProperty('contextRules')
  expect(payload.sourceCard.id).toBeTruthy()
  expect(Array.isArray(payload.conditions)).toBe(true)

  // The point of the envelope is the round trip: the exported text goes straight back into the dialog.
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText())
  await page.getByTestId('admin-effects-import-open').click()
  await page.getByTestId('admin-effects-import-payload').fill(clipboardText)

  await expect(page.getByTestId('admin-effects-import-summary'))
    .toContainText(`${renderedEffectCount} effects`)
  await expect(page.getByTestId('admin-effects-import-confirm')).toBeEnabled()

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('admin-effects-import-dialog')).toHaveCount(0)

  await context.close()
})

test('importing replaces the draft effect list without writing to the server', async ({ browser, request }) => {
  const { context, page } = await openSeededCardEditor(browser, request)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])

  const exported = await copyExportedEffects(page)
  const originalCount = exported.effects.length
  expect(originalCount).toBeGreaterThan(0)

  // One effect only, so the rendered list length proves the import replaced rather than appended.
  const importedEffect = {
    ...exported.effects[0],
    id: 'imported-effect',
    onSuccessEffectId: null,
    onFailureEffectId: null,
    targetSlotName: null,
    chainTargetSlotName: null,
  }

  const payloadText = JSON.stringify({
    kind: 'phv.card-effects',
    version: 1,
    sourceCard: { id: 'another-card', displayName: 'Another Card' },
    conditions: exported.conditions,
    effects: [importedEffect],
  })

  const effectPatches: string[] = []
  page.on('request', (outgoing) => {
    if (outgoing.method() === 'PATCH' && outgoing.url().includes('/effects')) {
      effectPatches.push(outgoing.url())
    }
  })

  await page.getByTestId('admin-effects-import-open').click()
  await page.getByTestId('admin-effects-import-payload').fill(payloadText)

  await expect(page.getByTestId('admin-effects-import-summary')).toContainText('1 effects')
  await expect(page.getByTestId('admin-effects-import-summary')).toContainText('Exported from a different card')

  await page.getByTestId('admin-effects-import-confirm').click()

  await expect(page.getByTestId('admin-effects-import-dialog')).toHaveCount(0)
  await expect(page.getByTestId('effect-card')).toHaveCount(1)
  await expect(page.getByTestId('admin-unsaved-pill')).toBeVisible()

  // Import only stages the draft: the PATCH belongs to the Save button, which this test never presses.
  await page.waitForTimeout(500)
  expect(effectPatches).toEqual([])

  // Reset discards the staged import, so the seeded catalogue is left exactly as it was found.
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByTestId('effect-card')).toHaveCount(originalCount)
  await expect(page.getByTestId('admin-unsaved-pill')).toHaveCount(0)

  await context.close()
})

test('the import dialog rejects malformed JSON and duplicate effect ids', async ({ browser, request }) => {
  const { context, page } = await openSeededCardEditor(browser, request)
  const input = page.getByTestId('admin-effects-import-payload')
  const confirm = page.getByTestId('admin-effects-import-confirm')
  const error = page.getByTestId('admin-effects-import-error')

  await page.getByTestId('admin-effects-import-open').click()
  await expect(confirm).toBeDisabled()

  await input.fill('{ not json')
  await expect(error).toContainText('not valid JSON')
  await expect(confirm).toBeDisabled()

  await input.fill(JSON.stringify({
    kind: 'phv.card-effects',
    version: 1,
    effects: [{ id: 'duplicated' }, { id: 'duplicated' }],
  }))
  await expect(error).toContainText('must be unique')
  await expect(confirm).toBeDisabled()

  // A payload from a newer client is refused rather than half-understood.
  await input.fill(JSON.stringify({ kind: 'phv.card-effects', version: 99, effects: [{ id: 'future' }] }))
  await expect(error).toContainText('newer admin client')
  await expect(confirm).toBeDisabled()

  // A minimal effect is enough for the dialog to accept it: defaults fill every field the panels need.
  await input.fill(JSON.stringify({ kind: 'phv.card-effects', version: 1, effects: [{ id: 'solo-effect' }] }))
  await expect(page.getByTestId('admin-effects-import-summary')).toContainText('1 effects')
  await expect(confirm).toBeEnabled()

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByTestId('effect-card').first()).toBeVisible()

  await context.close()
})
