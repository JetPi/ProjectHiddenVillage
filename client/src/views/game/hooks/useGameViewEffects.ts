import { useEffect, useMemo, useRef } from 'react'
import { preloadCardsByIds } from '../../../services/cardPreloadService'
import { preloadImageSources } from '../../../services/imagePreloadCache'
import chakraCardImage from '../../../assets/ChakraCard.webp'
import summonCardImage from '../../../assets/SummonCard.webp'
import cardBackImage from '../../../assets/CardBackside.png'
import type { IGameLoaderData } from '../types/routeData'
import { buildCardPreloadPayload } from '../utils/functions'

type IRevalidatorState = 'idle' | 'loading'
const STATIC_GAME_IMAGE_SOURCES = [chakraCardImage, summonCardImage, cardBackImage]

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

  function preloadGameImages(cardIds: string[] | null): void {
    if (cardIds && cardIds.length > 0) {
      void preloadCardsByIds(cardIds).catch(() => {
        // Card preloading is best effort and must not block gameplay rendering.
      })
    }

    void preloadImageSources(STATIC_GAME_IMAGE_SOURCES).catch(() => {
      // Static image preloading is best effort and must not block gameplay rendering.
    })
  }

  useEffect(() => {
    if (preloadPayload) {
      const { cardIds, signature } = preloadPayload
      if (signature !== lastPreloadedSignatureRef.current) {
        lastPreloadedSignatureRef.current = signature
        preloadGameImages(cardIds)
      }
    } else {
      preloadGameImages(null)
    }
  }, [preloadPayload])

  useEffect(() => {
    function handleReconnect() {
      preloadGameImages(preloadPayload?.cardIds ?? null)
    }

    window.addEventListener('online', handleReconnect)
    return () => window.removeEventListener('online', handleReconnect)
  }, [preloadPayload])
}

export {
  useIdleRevalidationPoll,
  useCardCatalogPreload,
}