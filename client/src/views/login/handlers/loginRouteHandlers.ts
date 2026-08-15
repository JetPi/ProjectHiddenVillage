import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router-dom'
import { api } from '@/services/api/httpClient'
import type { IAuthSession } from '@/state/authSession'
import { persistAuthSession } from '@/state/authSession'
import { getApiErrorMessage } from '@/views/utils/getApiErrorMessage'
import type {
  ILoginActionData,
  ILoginApiRequest,
  ILoginLoaderData,
  ILoginResponse,
} from '@/views/login/types/routeHandlers'

export async function loginLoader({ request }: LoaderFunctionArgs): Promise<ILoginLoaderData> {
  const url = new URL(request.url)

  return {
    signupSuccess: url.searchParams.get('signup') === 'success',
  }
}

export async function loginAction({ request }: ActionFunctionArgs): Promise<ILoginActionData> {
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
    const loginPayload: ILoginApiRequest = {
      email,
      password,
    }

    const {data: payload} = await api.post<ILoginResponse>('/api/user/login', loginPayload)

    const authUser: IAuthSession = {
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
