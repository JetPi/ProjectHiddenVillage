import type { IAuthSession } from '@/state/types/authSession'

export type ILoginResponse = {
  id: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
  /** Mirrors the `card_catalog_admin` claim the token carries; the admin route guard re-checks it server-side. */
  isCardCatalogAdmin: boolean
}

export type ILoginApiRequest = {
  email: string
  password: string
}

export type IUserResponse = {
  id: string
  username: string
  email: string
}

export type ISignUpApiRequest = {
  username: string
  email: string
  password: string
}

/** The login route's loader only exists to keep its hydrate-fallback behaviour; it carries no data. */
export type ILoginLoaderData = null

export type ILoginActionData = {
  login?: {
    ok: boolean
    error?: string
    user?: IAuthSession
  }
}

export type ISignUpActionData = {
  signUp?: {
    ok: boolean
    error?: string
    values?: {
      username: string
      email: string
    }
  }
}
