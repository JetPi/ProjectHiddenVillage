import type { ActionFunctionArgs } from 'react-router-dom'
import { redirect } from 'react-router-dom'
import i18n from '@/i18n'
import { api } from '@/services/api/httpClient'
import type { IAuthSession } from '@/state/authSession'
import { persistAuthSession } from '@/state/authSession'
import { publishAuthNotice } from '@/state/authNotices'
import { getApiErrorMessage } from '@/views/utils/getApiErrorMessage'
import type {
  ILoginApiRequest,
  ILoginResponse,
  ISignUpActionData,
  ISignUpApiRequest,
  IUserResponse,
} from '@/views/login/types/routeHandlers'

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
        error: i18n.t('auth.errors.signUpRequired'),
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
      isGuest: false,
    }

    persistAuthSession(authUser)
    publishAuthNotice('signedUp', authUser.username)

    return redirect('/')
  } catch (error) {
    return {
      signUp: {
        ok: false,
        error: getApiErrorMessage(error, i18n.t('auth.errors.signUpFailed')),
        values: {
          username,
          email,
        },
      },
    }
  }
}
