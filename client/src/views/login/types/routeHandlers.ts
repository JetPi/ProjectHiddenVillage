import type { IAuthSession } from '@/state/types/authSession'

export type ILoginResponse = {
  id: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
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
