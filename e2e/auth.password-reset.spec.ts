import { expect, test } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { API_BASE_URL } from './helpers/multiplayer/api'

/**
 * Password recovery end to end. The suite has no mailbox, so the server records the mail it would have sent (see
 * RecordingEmailSender, enabled only with the test profiles) and `api/test/password-reset/last-reset` hands the link
 * back. Everything after that is the real flow: the mailed URL, the form, the confirm endpoint, the session.
 */

const ORIGINAL_PASSWORD = 'E2eOriginalPass1!'
const NEW_PASSWORD = 'E2eReplacementPass2!'

type CapturedResetMail = {
  recipientEmail: string
  resetUrl: string
  expiresAtUtc: string
}

function uniqueEmail(): string {
  return `e2e-reset-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`
}

async function captureResetMail(
  request: APIRequestContext,
  email: string,
): Promise<CapturedResetMail> {
  const response = await request.get(
    `${API_BASE_URL}/api/test/password-reset/last-reset?email=${encodeURIComponent(email)}`,
  )

  expect(response.ok()).toBeTruthy()

  return (await response.json()) as CapturedResetMail
}

test('a recovery link sets a new password, signs the account in, and spends itself', async ({
  page,
  request,
}) => {
  const email = uniqueEmail()

  const signUp = await request.post(`${API_BASE_URL}/api/user`, {
    data: {
      username: 'E2E Reset Player',
      email,
      password: ORIGINAL_PASSWORD,
    },
  })
  expect(signUp.status()).toBe(201)

  const forgot = await request.post(`${API_BASE_URL}/api/user/password-reset/request`, {
    data: { email },
  })
  expect(forgot.status()).toBe(202)

  const mail = await captureResetMail(request, email)
  const mailedLink = new URL(mail.resetUrl)
  expect(mailedLink.pathname).toBe('/reset-password')

  await page.goto(`${mailedLink.pathname}${mailedLink.search}`)

  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('Confirm new password', { exact: true }).fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Set new password' }).click()

  // The confirm response is a session: the flow lands on the login view already signed in as the recovered account.
  await expect(page).toHaveURL(/\/$/)
  const storedSession = await page.evaluate(() => {
    const raw = window.localStorage.getItem('phv-auth-session')

    return raw ? (JSON.parse(raw) as { email: string; isGuest: boolean }) : null
  })
  expect(storedSession?.email).toBe(email)
  expect(storedSession?.isGuest).toBe(false)

  // The old password is dead, the new one works.
  const oldLogin = await request.post(`${API_BASE_URL}/api/user/login`, {
    data: { email, password: ORIGINAL_PASSWORD },
  })
  expect(oldLogin.status()).toBe(401)

  const newLogin = await request.post(`${API_BASE_URL}/api/user/login`, {
    data: { email, password: NEW_PASSWORD },
  })
  expect(newLogin.status()).toBe(200)

  // The link was single use: replaying the very token that just worked is a 400, not a second reset.
  const token = mailedLink.searchParams.get('token')
  expect(token).toBeTruthy()

  const replay = await request.post(`${API_BASE_URL}/api/user/password-reset/confirm`, {
    data: { token, newPassword: 'E2eAnotherPass3!' },
  })
  expect(replay.status()).toBe(400)
})

test('the recovery form gives the same answer for an unknown address', async ({ page }) => {
  await page.goto('/forgot-password')

  await page.getByLabel('Email').fill(uniqueEmail())
  await page.getByRole('button', { name: 'Send reset link' }).click()

  // Neutral by design: the screen must not become a way to test whether an email has an account.
  await expect(page.getByTestId('forgot-password-sent')).toBeVisible()
})

test('a reset page without a token offers a new link instead of a dead form', async ({ page }) => {
  await page.goto('/reset-password')

  await expect(page.getByTestId('reset-password-missing-token')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveAttribute(
    'href',
    '/forgot-password',
  )
})
