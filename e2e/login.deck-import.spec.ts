import { expect, test } from '@playwright/test'

test('the imported deck text survives a reload', async ({ page }) => {
  const deckText = '// Main Deck\n4x N-010\n2x N-013'

  await page.goto('/')

  const importButton = page.getByRole('button', { name: 'Import your deck here' })
  await expect(importButton).toBeVisible({ timeout: 30_000 })
  await importButton.click()

  const textarea = page.locator('#deckImportPayload')
  await textarea.fill(deckText)

  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.reload()

  await expect(importButton).toBeVisible({ timeout: 30_000 })
  await importButton.click()
  await expect(textarea).toHaveValue(deckText)

  const dialog = page.getByRole('dialog', { name: 'Import Deck List' })
  await expect(dialog.getByTestId('login-deck-ruleset-status')).toHaveCount(2)
  await expect(dialog.locator('[data-ruleset-legal="false"]')).toHaveCount(2)
  await expect(page.locator('form').getByTestId('login-deck-format-status')).toHaveText(
    "Deck isn't valid for any format.",
    { timeout: 30_000 },
  )
})
