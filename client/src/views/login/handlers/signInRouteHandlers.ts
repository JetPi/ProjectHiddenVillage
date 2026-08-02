import type { ActionFunctionArgs } from 'react-router-dom'
import { redirect } from 'react-router-dom'
import { api } from '../../../services/api/httpClient'
import { getApiErrorMessage } from '../../utils/getApiErrorMessage'

type UserResponse = {
  id: string
  username: string
  email: string
}

type SignUpApiRequest = {
  username: string
  email: string
  password: string
}

export type SignUpActionData = {
  signUp?: {
    ok: boolean
    error?: string
    values?: {
      username: string
      email: string
    }
  }
}

export async function signInLoader(): Promise<null> {
  return null
}

export async function signInAction({ request }: ActionFunctionArgs): Promise<SignUpActionData | Response> {
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
    const signUpPayload: SignUpApiRequest = {
      username,
      email,
      password,
    }

    await api.post<UserResponse>('/api/user', signUpPayload)

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
