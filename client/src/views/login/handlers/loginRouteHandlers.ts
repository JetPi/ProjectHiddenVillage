import type { ActionFunctionArgs } from 'react-router-dom'
import i18n from '@/i18n'
import { api } from '@/services/api/httpClient'
import type { IAuthSession } from '@/state/authSession'
import { persistAuthSession } from '@/state/authSession'
import { publishAuthNotice } from '@/state/authNotices'
import { getApiErrorMessage } from '@/views/utils/getApiErrorMessage'
import type {
  ILoginActionData,
  ILoginApiRequest,
  ILoginLoaderData,
  ILoginResponse,
} from '@/views/login/types/routeHandlers'

/**
 * Kept so the route still has a loader and therefore the same hydrate-fallback behaviour. It returns nothing:
 * auth notices are events published by the actions, not data a navigation should re-derive.
 */
export async function loginLoader(): Promise<ILoginLoaderData> {
  return null
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
        error: i18n.t('auth.errors.emailAndPasswordRequired'),
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
      isGuest: false,
    }

    persistAuthSession(authUser)
    publishAuthNotice('signedIn', authUser.username)

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
        error: getApiErrorMessage(error, i18n.t('auth.errors.loginFailed')),
      },
    }
  }
}
