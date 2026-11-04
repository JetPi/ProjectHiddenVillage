import { api } from '@/services/api/httpClient'

/** The caller's own record. The server resolves it from the token, so the id is never supplied by the client. */
export type ICurrentUserResponse = {
  id: string
  username: string
  email: string
  isCardCatalogAdmin: boolean
}

/**
 * Asks the server who the current token belongs to.
 *
 * This exists for the admin route guard: capability has to come from somewhere the browser cannot edit, and
 * localStorage is not that place.
 */
export async function fetchCurrentUser(): Promise<ICurrentUserResponse> {
  const { data } = await api.get<ICurrentUserResponse>('/api/user/me')

  return data
}
