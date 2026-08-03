export type AuthSession = {
  userId: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
}

const AUTH_SESSION_STORAGE_KEY = 'phv-auth-session'

export function readAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const rawValue = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AuthSession>
    if (
      !parsed.userId ||
      !parsed.username ||
      !parsed.email ||
      !parsed.accessToken ||
      !parsed.expiresAt
    ) {
      clearAuthSession()
      return null
    }

    const expiresAtMs = Date.parse(parsed.expiresAt)
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
      clearAuthSession()
      return null
    }

    return {
      userId: parsed.userId,
      username: parsed.username,
      email: parsed.email,
      accessToken: parsed.accessToken,
      expiresAt: parsed.expiresAt,
    }
  } catch {
    clearAuthSession()
    return null
  }
}

export function getAuthAccessToken(): string | null {
  const session = readAuthSession()
  return session?.accessToken ?? null
}

export function persistAuthSession(session: AuthSession): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearAuthSession(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
}
