import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router-dom'
import { api } from '../../../services/api/httpClient'
import type { AuthSession } from '../../../state/authSession'
import { persistAuthSession, readAuthSession } from '../../../state/authSession'
import { getApiErrorMessage } from '../../utils/getApiErrorMessage'

type LoginResponse = {
  id: string
  username: string
  email: string
  accessToken: string
  expiresAt: string
}

type LoginApiRequest = {
  email: string
  password: string
}

export type LoginLoaderData = {
  signupSuccess: boolean
  authUser: AuthSession | null
}

export type LoginActionData = {
  login?: {
    ok: boolean
    error?: string
    user?: AuthSession
  }
}

export async function loginLoader({ request }: LoaderFunctionArgs): Promise<LoginLoaderData> {
  const url = new URL(request.url)

  return {
    signupSuccess: url.searchParams.get('signup') === 'success',
    authUser: readAuthSession(),
  }
}

export async function loginAction({ request }: ActionFunctionArgs): Promise<LoginActionData> {
  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')

  if (intent !== 'login') {
    return {}
  }

  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '').trim()

  if (!email || !password) {
    return {
      login: {
        ok: false,
        error: 'Email and password are required.',
      },
    }
  }

  try {
    const loginPayload: LoginApiRequest = {
      email,
      password,
    }

    const {data: payload} = await api.post<LoginResponse>('/api/user/login', loginPayload)

    const authUser: AuthSession = {
      userId: payload.id,
      username: payload.username,
      email: payload.email,
      accessToken: payload.accessToken,
      expiresAt: payload.expiresAt,
    }

    persistAuthSession(authUser)

    return {
      login: {
        ok: true,
        user: authUser,
      },
    }
  } catch (error) {
    return {
      login: {
        ok: false,
        error: getApiErrorMessage(error, 'Login failed. Please try again.'),
      },
    }
  }
}
