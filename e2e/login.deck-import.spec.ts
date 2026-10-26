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

  // The ruleset window mounts its pill list straight away instead of rendering a placeholder first. The login
  // view starts in quick match, which queues for one format, so the dialog lists exactly that format.
  await expect(dialog.getByTestId('login-deck-ruleset-status')).toHaveCount(1)
  await expect(dialog.locator('[data-ruleset-legal="pending"]')).toHaveCount(1)
  await expect(dialog.getByTestId('login-deck-import-status')).toBeVisible()

  await textarea.fill(deckText)
  await textarea.press('Enter')
  await textarea.pressSequentially('3x')

  await expect(dialog).toBeVisible()
  await expect(dialog.getByTestId('login-deck-parse-error')).toContainText('Invalid deck line 4')
  await expect(dialog.getByTestId('login-deck-ruleset-status')).toHaveCount(1)

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

  await expect(dialog.getByTestId('login-deck-ruleset-status')).toHaveCount(1)
  await expect(dialog.locator('[data-ruleset-legal="false"]')).toHaveCount(1)
  await expect(page.locator('form').getByTestId('login-deck-format-status')).toHaveText(
    "Deck isn't valid for any format.",
    { timeout: 30_000 },
  )

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
