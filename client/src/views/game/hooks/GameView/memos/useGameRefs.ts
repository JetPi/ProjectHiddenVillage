import { useCallback, useMemo, useRef } from 'react'
import type { IGameViewAnimController } from '@/views/game/types'
import { whenIdle } from '@/views/game/animation'

export function useGameRefs() {
  const boardZoneRef = useRef<HTMLDivElement | null>(null)
  const topDeckCardRef = useRef<HTMLDivElement | null>(null)
  const bottomDeckCardRef = useRef<HTMLDivElement | null>(null)
  const topTrashCardRef = useRef<HTMLDivElement | null>(null)
  const bottomTrashCardRef = useRef<HTMLDivElement | null>(null)
  const topHandRowRef = useRef<HTMLDivElement | null>(null)
  const bottomHandRowRef = useRef<HTMLDivElement | null>(null)

  const setTopHandRowRefs = useCallback((node: HTMLDivElement | null) => {
    topHandRowRef.current = node
  }, [topHandRowRef])

  const setBottomHandRowRefs = useCallback((node: HTMLDivElement | null) => {
    bottomHandRowRef.current = node
  }, [bottomHandRowRef])

  const setBoardZoneRef = useCallback((node: HTMLDivElement | null) => {
    boardZoneRef.current = node
  }, [boardZoneRef])

  const setTopDeckCardRef = useCallback((node: HTMLDivElement | null) => {
    topDeckCardRef.current = node
  }, [topDeckCardRef])

  const setBottomDeckCardRef = useCallback((node: HTMLDivElement | null) => {
    bottomDeckCardRef.current = node
  }, [bottomDeckCardRef])

  const setTopTrashCardRef = useCallback((node: HTMLDivElement | null) => {
    topTrashCardRef.current = node
  }, [topTrashCardRef])

  const setBottomTrashCardRef = useCallback((node: HTMLDivElement | null) => {
    bottomTrashCardRef.current = node
  }, [bottomTrashCardRef])

  return useMemo(() => ({
    boardZoneRef,
    topDeckCardRef,
    bottomDeckCardRef,
    topTrashCardRef,
    bottomTrashCardRef,
    topHandRowRef,
    bottomHandRowRef,
    setTopHandRowRefs,
    setBottomHandRowRefs,
    setBoardZoneRef,
    setTopDeckCardRef,
    setBottomDeckCardRef,
    setTopTrashCardRef,
    setBottomTrashCardRef,
  }), [
    boardZoneRef,
    topDeckCardRef,
    bottomDeckCardRef,
    topTrashCardRef,
    bottomTrashCardRef,
    topHandRowRef,
    bottomHandRowRef,
    setTopHandRowRefs,
    setBottomHandRowRefs,
    setBoardZoneRef,
    setTopDeckCardRef,
    setBottomDeckCardRef,
    setTopTrashCardRef,
    setBottomTrashCardRef,
  ])
}

export function useGameAnimationController() {
  return useRef<IGameViewAnimController>({
    whenIdle,
    handledAnimationEventIds: new Set<string>(),
    drawAnimationEndsAt: null,
    pendingDrawAnimationFrameId: null,
    pendingDrawTimeoutIds: [],
    pendingMulliganDrawReplay: false,
    pendingMulliganDrawReplayExpiresAtMs: 0,
    previousHandZoneSnapshot: {
      topHandInstanceIds: new Set<string>(),
      bottomHandInstanceIds: new Set<string>(),
      topDeckCount: 0,
      bottomDeckCount: 0,
      topTrashCount: 0,
      bottomTrashCount: 0,
      isInitialized: false,
    },
    suppressedExitGhostInstanceIds: new Set<string>(),
  })
}
