import { expect, test } from '@playwright/test'

/**
 * Pinned literally rather than imported from the component: the point of the test is that the invite a visitor
 * actually receives is this server, and importing the constant would make the assertion agree with any edit.
 */
const DISCORD_INVITE_URL = 'https://discord.gg/4HRsFHAhPy'

/**
 * The community invite is the only way a player can reach the people who can act on a report, so it is worth a
 * regression test: it must be on the login panel, and it must open in a new tab so a visitor keeps the display name
 * and deck they had already chosen.
 */
test('the login panel offers the community invite in a new tab', async ({ page }) => {
  await page.goto('/')

  const invite = page.getByTestId('login-discord-invite')

  await expect(invite).toBeVisible()
  await expect(invite).toHaveAttribute('href', DISCORD_INVITE_URL)
  await expect(invite).toHaveAttribute('target', '_blank')
  await expect(invite).toHaveAttribute('rel', /noopener/)
  await expect(invite).toHaveAttribute('rel', /noreferrer/)
})
