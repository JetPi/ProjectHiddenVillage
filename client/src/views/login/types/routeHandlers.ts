import type { IAuthSession } from '../../../state/types/authSession'

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

export type ILoginLoaderData = {
  signupSuccess: boolean
}

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
