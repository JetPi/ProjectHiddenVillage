import axios from 'axios'

export function getApiErrorMessage(error: unknown, fallbackMessage: string): string {
  if (!axios.isAxiosError(error)) {
    return fallbackMessage
  }

  const payload = error.response?.data

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload
  }

  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = payload.detail
    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail
    }
  }

  return fallbackMessage
}

/**
 * Whether the API refused the request as invalid input. Callers use this to swap a server-authored description -
 * which may be a whole list of rule violations - for copy that points at the view explaining them.
 */
export function isApiBadRequestError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 400
}
