import { useEffect, useMemo } from "react"
import { normalizePlayerId } from "@/views/game/utils/functions"

function useGetBattlefieldDisplayOrderStorageKey(authUserId: string, joinCode: string) {
  return useMemo(() => {
    const normalizedUserId = normalizePlayerId(authUserId!)
    return `phv:battlefield-display-order:${joinCode}:${normalizedUserId || 'anonymous'}`
  }, [authUserId, joinCode])
}

function usePersistedBattlefieldDisplayOrderEffect(storageKey: string, top: string[], bottom: string[]) {
 useEffect(() => {
     if (typeof window === 'undefined') {
       return
     }
 
     const payload = JSON.stringify({
       top,
       bottom,
     })

     window.sessionStorage.setItem(storageKey, payload)
   }, [storageKey, bottom, top])
}

export { usePersistedBattlefieldDisplayOrderEffect, useGetBattlefieldDisplayOrderStorageKey }