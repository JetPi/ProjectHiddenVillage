import axios from 'axios'
import { getAuthAccessToken } from '../../state/authSession'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001'

export const api = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = getAuthAccessToken()

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})
