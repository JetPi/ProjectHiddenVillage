import type { ActionFunctionArgs } from 'react-router-dom'
import i18n from '@/i18n'
import { api } from '@/services/api/httpClient'
import { getApiErrorMessage } from '@/views/utils/getApiErrorMessage'
import type {
  IForgotPasswordActionData,
  IPasswordResetRequestApi,
} from '@/views/login/types/passwordReset'

export async function forgotPasswordLoader(): Promise<null> {
  return null
}

export async function forgotPasswordAction({
  request,
}: ActionFunctionArgs): Promise<IForgotPasswordActionData> {
  const formData = await request.formData()
  const email = String(formData.get('email') ?? '').trim()

  if (!email) {
    return {
      request: {
        ok: false,
        error: i18n.t('auth.errors.emailRequired'),
      },
    }
  }

  try {
    const payload: IPasswordResetRequestApi = { email }

    await api.post('/api/user/password-reset/request', payload)

    // The server answers 202 whether or not the address has an account, and this action must keep that
    // indistinguishable: a "no such user" state here would throw away the whole point of the endpoint.
    return { request: { ok: true } }
  } catch (error) {
    return {
      request: {
        ok: false,
        error: getApiErrorMessage(error, i18n.t('auth.errors.passwordResetRequestFailed')),
      },
    }
  }
}
