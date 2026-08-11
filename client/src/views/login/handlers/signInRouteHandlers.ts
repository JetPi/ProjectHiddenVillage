import type { ActionFunctionArgs } from 'react-router-dom'
import { redirect } from 'react-router-dom'
import { api } from '../../../services/api/httpClient'
import type { IAuthSession } from '../../../state/authSession'
import { persistAuthSession } from '../../../state/authSession'
import { getApiErrorMessage } from '../../utils/getApiErrorMessage'
import type {
  ILoginApiRequest,
  ILoginResponse,
  ISignUpActionData,
  ISignUpApiRequest,
  IUserResponse,
} from '../types/routeHandlers'

export async function signInLoader(): Promise<null> {
  return null
}

export async function signInAction({ request }: ActionFunctionArgs): Promise<ISignUpActionData | Response> {
  const formData = await request.formData()

  const username = String(formData.get('username') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '').trim()

  if (!username || !email || !password) {
    return {
      signUp: {
        ok: false,
        error: 'Username, email, and password are required.',
        values: {
          username,
          email,
        },
      },
    }
  }

  try {
    const signUpPayload: ISignUpApiRequest = {
      username,
      email,
      password,
    }

    await api.post<IUserResponse>('/api/user', signUpPayload)

    // Auto-login after successful signup so the user can continue immediately.
    const loginPayload: ILoginApiRequest = {
      email,
      password,
    }

    const { data: loginResponse } = await api.post<ILoginResponse>('/api/user/login', loginPayload)

    const authUser: IAuthSession = {
      userId: loginResponse.id,
      username: loginResponse.username,
      email: loginResponse.email,
      accessToken: loginResponse.accessToken,
      expiresAt: loginResponse.expiresAt,
    }

    persistAuthSession(authUser)

    return redirect('/?signup=success')
  } catch (error) {
    return {
      signUp: {
        ok: false,
        error: getApiErrorMessage(error, 'Sign up failed. Please try again.'),
        values: {
          username,
          email,
        },
      },
    }
  }
}
