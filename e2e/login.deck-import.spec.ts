import { expect, test } from '@playwright/test'

test('the imported deck text survives a reload', async ({ page }) => {
  const deckText = '// Main Deck\n4x N-010\n2x N-013'
  const expectedDeckText = `${deckText}\n3x N-014`

  await page.goto('/')

  const importButton = page.getByRole('button', { name: 'Import your deck here' })
  await expect(importButton).toBeVisible({ timeout: 30_000 })
  await importButton.click()

  const dialog = page.getByRole('dialog', { name: 'Import Deck List' })
  const textarea = page.locator('#deckImportPayload')

  // The ruleset window mounts its pill list straight away instead of rendering a placeholder first. The dialog is
  // where a deck gets fixed, so it lists every active format regardless of which format the current tab plays.
  await expect(dialog.getByTestId('login-deck-ruleset-status').first()).toBeVisible()
  await expect(dialog.locator('[data-ruleset-legal="pending"]').first()).toBeVisible()
  await expect(dialog.getByTestId('login-deck-import-status')).toBeVisible()

  await textarea.fill(deckText)
  await textarea.press('Enter')
  await textarea.pressSequentially('3x')

  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('login-deck-parse-error')).toContainText('Invalid deck line 4')
  await expect(dialog.getByTestId('login-deck-ruleset-status').first()).toBeVisible()

  const mainWindowBox = await dialog.getByTestId('import-deck-main-window').boundingBox()
  const validationWindowBox = await dialog.getByTestId('import-deck-validation-window').boundingBox()
  expect(mainWindowBox).not.toBeNull()
  expect(validationWindowBox).not.toBeNull()
  expect(validationWindowBox?.height ?? 0).toBeLessThanOrEqual((mainWindowBox?.height ?? 0) + 1)

  const mainForm = page.locator('form')
  await expect(mainForm.getByTestId('login-deck-invalid-value')).toHaveText('Invalid deck value')

  await textarea.pressSequentially(' N-014')

  await expect(dialog).toBeVisible()
  await expect(textarea).toHaveValue(expectedDeckText)
  await expect(dialog.getByTestId('login-deck-parse-error')).toHaveCount(0)
  await expect(mainForm.getByTestId('login-deck-invalid-value')).toHaveCount(0)

  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.reload()

  await expect(importButton).toBeVisible({ timeout: 30_000 })
  await importButton.click()
  await expect(textarea).toHaveValue(expectedDeckText)

  await expect(dialog.getByTestId('login-deck-ruleset-status').first()).toBeVisible()
  await expect(dialog.locator('[data-ruleset-legal="false"]').first()).toBeVisible()

  // The inline summary is the other half: it names the deck and judges it against the format the tab plays.
  const summary = page.locator('form').getByTestId('login-deck-summary')
  await expect(summary).toHaveAttribute('data-legal', 'false', { timeout: 30_000 })
  await expect(page.locator('form').getByTestId('login-deck-summary-pill')).toHaveText('Not legal')
  // No leader in that list, so the deck has no name of its own to show.
  await expect(summary.locator('span').last()).toHaveText('Imported deck')

  const mainWindowBeforeExtraLine = await dialog.getByTestId('import-deck-main-window').boundingBox()
  const validationWindowBeforeExtraLine = await dialog.getByTestId('import-deck-validation-window').boundingBox()

  await textarea.pressSequentially('\n2x N-010')
  await expect(dialog.locator('[data-violation-code="tooManyCopies"]').first()).toBeVisible()

  await expect
    .poll(async () => dialog.getByTestId('import-deck-main-window').boundingBox())
    .toEqual(mainWindowBeforeExtraLine)
  await expect
    .poll(async () => dialog.getByTestId('import-deck-validation-window').boundingBox())
    .toEqual(validationWindowBeforeExtraLine)
})
