import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { buildHubUrl } from '@/services/api/hubUrl'
import { fetchPresence } from '@/services/api/presenceApi'
import { getAuthAccessToken } from '@/state/authSession'
import { usePresenceStore } from '@/state/presenceStore'
import type { IPresenceSnapshot } from '@/types/presence'

const PRESENCE_HUB_PATH = '/hubs/presence'
const PRESENCE_UPDATED_EVENT = 'PresenceUpdated'
const VIEWER_ID_STORAGE_KEY = 'phv-viewer-id'

/**
 * The id the server counts this browser under. localStorage rather than sessionStorage so every tab of one
 * browser counts as one viewer, and the id is deliberately not the player id: a visitor has none until they
 * submit, and the development auth bypass would collapse them all onto one seeded user.
 */
export function getOrCreateViewerId(): string {
  if (typeof window === 'undefined') {
    return ''
  }

  const existing = window.localStorage.getItem(VIEWER_ID_STORAGE_KEY)?.trim()
  if (existing) {
    return existing
  }

  const created = createViewerId()
  window.localStorage.setItem(VIEWER_ID_STORAGE_KEY, created)

  return created
}

function createViewerId(): string {
  const cryptoApi = typeof crypto === 'undefined' ? null : crypto

  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  return `viewer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

let connection: HubConnection | null = null

function applySnapshot(snapshot: IPresenceSnapshot): void {
  usePresenceStore.getState().setSnapshot(snapshot)
}

async function refreshSnapshot(): Promise<void> {
  try {
    applySnapshot(await fetchPresence())
  } catch {
    // The last known figure stays on screen; the socket will bring a fresh one when it is back.
  }
}

/**
 * Opens the one presence connection this tab will ever have. Module-level state makes it idempotent, which matters
 * under React StrictMode where the mounting effect runs twice.
 */
export function startPresenceConnection(): void {
  if (connection) {
    return
  }

  void refreshSnapshot()

  const hubConnection = new HubConnectionBuilder()
    .withUrl(buildHubUrl(PRESENCE_HUB_PATH, { viewerId: getOrCreateViewerId() }), {
      accessTokenFactory: () => getAuthAccessToken() ?? '',
      withCredentials: false,
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.None)
    .build()

  hubConnection.on(PRESENCE_UPDATED_EVENT, (snapshot: IPresenceSnapshot) => {
    applySnapshot(snapshot)
  })

  hubConnection.onreconnecting(() => {
    usePresenceStore.getState().setConnected(false)
  })

  hubConnection.onreconnected(() => {
    usePresenceStore.getState().setConnected(true)
    // Events published while the socket was down were missed, so a full read catches up.
    void refreshSnapshot()
  })

  hubConnection.onclose(() => {
    usePresenceStore.getState().setConnected(false)
  })

  connection = hubConnection

  void hubConnection
    .start()
    .then(() => usePresenceStore.getState().setConnected(true))
    .catch(() => usePresenceStore.getState().setConnected(false))
}
