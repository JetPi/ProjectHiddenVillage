export type ISessionPayload = {
  displayName: string
  gameCode: string
}

export type ISessionStoreState = {
  displayName: string
  gameCode: string
  setSession: (payload: ISessionPayload) => void
  clearSession: () => void
}
