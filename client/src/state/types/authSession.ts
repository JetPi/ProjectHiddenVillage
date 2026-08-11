export type IAuthSession = {
  userId: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
}

export type IAuthSessionStoreState = {
  session: IAuthSession | null
  setSession: (session: IAuthSession) => void
  clearSession: () => void
}
