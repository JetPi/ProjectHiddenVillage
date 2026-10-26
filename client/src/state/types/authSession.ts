export type IAuthSession = {
  userId: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
  /**
   * True for the throwaway identity minted from a display name. Guests play every mode, but they own nothing
   * durable: no saved decks, and (once win/loss tracking exists) no record.
   */
  isGuest: boolean
}

export type IAuthSessionStoreState = {
  session: IAuthSession | null
  setSession: (session: IAuthSession) => void
  clearSession: () => void
}
