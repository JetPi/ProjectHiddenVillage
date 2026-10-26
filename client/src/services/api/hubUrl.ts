const defaultApiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3001'

const hubBaseUrl = defaultApiBaseUrl.endsWith('/')
  ? defaultApiBaseUrl.slice(0, -1)
  : defaultApiBaseUrl

/** Builds a hub URL with the query parameters a browser cannot send as headers. */
export function buildHubUrl(path: string, query: Record<string, string> = {}): string {
  const url = new URL(`${hubBaseUrl}${path}`)

  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value)
  }

  return url.toString()
}
