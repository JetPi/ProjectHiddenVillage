import { create } from 'zustand'
import type { IAuthSession, IAuthSessionStoreState } from '@/state/types/authSession'

const AUTH_SESSION_STORAGE_KEY = 'phv-auth-session'

function parseAuthSession(rawValue: string | null): IAuthSession | null {
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<IAuthSession>
    if (
      !parsed.userId ||
      !parsed.username ||
      !parsed.email ||
      !parsed.accessToken ||
      !parsed.expiresAt
    ) {
      return null
    }

    const expiresAtMs = Date.parse(parsed.expiresAt)
    if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
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
    return null
  }
}

function readAuthSessionFromStorage(): IAuthSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const rawValue = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
  const parsedSession = parseAuthSession(rawValue)

  if (!parsedSession && rawValue) {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
  }

  return parsedSession
}

const initialSession = readAuthSessionFromStorage()

export const useAuthSessionStore = create<IAuthSessionStoreState>()((set) => ({
  session: initialSession,
  setSession: (session) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
    }

    set({ session })
  },
  clearSession: () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
    }

    set({ session: null })
  },
}))

export function readAuthSession(): IAuthSession | null {
  const session = useAuthSessionStore.getState().session
  if (!session) {
    return null
  }

  const expiresAtMs = Date.parse(session.expiresAt)
  if (Number.isNaN(expiresAtMs) || expiresAtMs <= Date.now()) {
    useAuthSessionStore.getState().clearSession()
    return null
  }

  return session
}

export function getAuthAccessToken(): string | null {
  const session = readAuthSession()
  return session?.accessToken ?? null
}

export function persistAuthSession(session: IAuthSession): void {
  useAuthSessionStore.getState().setSession(session)
}

export function clearAuthSession(): void {
  useAuthSessionStore.getState().clearSession()
}

export type {
  IAuthSession,
}
