function normalizeCardInstanceId(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function normalizePlayerId(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/-/g, '')
}

function readPersistedBattlefieldDisplayOrder(storageKey: string): {
  top: string[]
  bottom: string[]
} {
  if (typeof window === 'undefined') {
    return { top: [], bottom: [] }
  }

  const serializedOrder = window.sessionStorage.getItem(storageKey)
  if (!serializedOrder) {
    return { top: [], bottom: [] }
  }

  try {
    const parsedOrder = JSON.parse(serializedOrder) as {
      top?: unknown
      bottom?: unknown
    }

    return {
      top: Array.isArray(parsedOrder.top)
        ? parsedOrder.top.filter((entry): entry is string => typeof entry === 'string')
        : [],
      bottom: Array.isArray(parsedOrder.bottom)
        ? parsedOrder.bottom.filter((entry): entry is string => typeof entry === 'string')
        : [],
    }
  } catch {
    return { top: [], bottom: [] }
  }
}

export {  normalizeCardInstanceId, normalizePlayerId, readPersistedBattlefieldDisplayOrder}