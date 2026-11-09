import type { ActionFunctionArgs } from 'react-router-dom'
import { redirect } from 'react-router-dom'
import i18n from '@/i18n'
import { api } from '@/services/api/httpClient'
import type { IAuthSession } from '@/state/authSession'
import { persistAuthSession } from '@/state/authSession'
import { publishAuthNotice } from '@/state/authNotices'
import { getApiErrorMessage } from '@/views/utils/getApiErrorMessage'
import type { ILoginResponse } from '@/views/login/types/routeHandlers'
import type {
  IPasswordResetConfirmApi,
  IResetPasswordActionData,
} from '@/views/login/types/passwordReset'

/** Mirrors the server policy; kept here only to fail before the request and keep the message local. */
const MINIMUM_PASSWORD_LENGTH = 10

export async function resetPasswordLoader(): Promise<null> {
  return null
}

export async function resetPasswordAction({
  request,
}: ActionFunctionArgs): Promise<IResetPasswordActionData | Response> {
  const formData = await request.formData()

  const token = String(formData.get('token') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  if (!token) {
    return {
      reset: {
        ok: false,
        error: i18n.t('auth.errors.resetLinkMissing'),
      },
    }
  }

  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    return {
      reset: {
        ok: false,
        error: i18n.t('auth.errors.passwordTooShort', { count: MINIMUM_PASSWORD_LENGTH }),
      },
    }
  }

  if (password !== confirmPassword) {
    return {
      reset: {
        ok: false,
        error: i18n.t('auth.errors.passwordMismatch'),
      },
    }
  }

  try {
    const payload: IPasswordResetConfirmApi = { token, newPassword: password }

    const { data } = await api.post<ILoginResponse>('/api/user/password-reset/confirm', payload)

    // The confirm response is a session, not an acknowledgement: the flow signs the account in on this device.
    const authUser: IAuthSession = {
      userId: data.id,
      username: data.username,
      email: data.email,
      accessToken: data.accessToken,
      expiresAt: data.expiresAt,
      isGuest: false,
      isCardCatalogAdmin: data.isCardCatalogAdmin === true,
    }

    persistAuthSession(authUser)
    publishAuthNotice('passwordReset', authUser.username)

    return redirect('/')
  } catch (error) {
    return {
      reset: {
        ok: false,
        error: getApiErrorMessage(error, i18n.t('auth.errors.passwordResetFailed')),
      },
    }
  }
}
