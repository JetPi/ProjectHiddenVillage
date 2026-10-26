import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { startPresenceConnection } from '@/services/presence/presenceConnection'

export type IPresenceProviderProps = {
  children: ReactNode
}

/**
 * Mounted once above the router, so every route - login, sign-in, admin, board - counts as one viewer and shares
 * the same snapshot.
 */
export function PresenceProvider({ children }: IPresenceProviderProps) {
  useEffect(() => {
    startPresenceConnection()
  }, [])

  return <>{children}</>
}
