import { useEffect, useMemo, useRef } from 'react'
import { preloadCardsByIds } from '../../../services/cardPreloadService'
import type { IGameLoaderData } from '../types/routeData'
import { buildCardPreloadPayload } from '../utils/functions'

type IRevalidatorState = 'idle' | 'loading'

function useIdleRevalidationPoll(
  revalidatorState: IRevalidatorState,
  revalidate: () => void,
  intervalMs: number,
): void {
  useEffect(() => {
    if (revalidatorState !== 'idle') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      revalidate()
    }, intervalMs)

    return () => window.clearTimeout(timeoutId)
  }, [intervalMs, revalidate, revalidatorState])
}

function useCardCatalogPreload(gameCards: IGameLoaderData['gameCards']): void {
  const lastPreloadedSignatureRef = useRef('')
  const preloadPayload = useMemo(() => buildCardPreloadPayload(gameCards), [gameCards])

  useEffect(() => {
    if (!preloadPayload) {
      return
    }

    const { cardIds, signature } = preloadPayload
    if (signature === lastPreloadedSignatureRef.current) {
      return
    }

    lastPreloadedSignatureRef.current = signature

    void preloadCardsByIds(cardIds).catch(() => {
      // Card preloading is best effort and must not block gameplay rendering.
    })
  }, [preloadPayload])
}

export {
  useIdleRevalidationPoll,
  useCardCatalogPreload,
}