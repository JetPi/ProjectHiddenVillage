import { useCallback, useMemo, useRef } from 'react'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import type { IGameViewAnimController } from '@/views/game/types'

export function useGameRefs() {
  const boardZoneRef = useRef<HTMLDivElement | null>(null)
  const topDeckCardRef = useRef<HTMLDivElement | null>(null)
  const bottomDeckCardRef = useRef<HTMLDivElement | null>(null)
  const topTrashCardRef = useRef<HTMLDivElement | null>(null)
  const bottomTrashCardRef = useRef<HTMLDivElement | null>(null)
  const topHandRowRef = useRef<HTMLDivElement | null>(null)
  const bottomHandRowRef = useRef<HTMLDivElement | null>(null)
  const [topHandAutoAnimateRef] = useAutoAnimate({ duration: 220, easing: 'ease-out' })

  const setTopHandRowRefs = useCallback((node: HTMLDivElement | null) => {
    topHandRowRef.current = node
    topHandAutoAnimateRef(node)
  }, [topHandAutoAnimateRef, topHandRowRef])

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

  // The returned object identity must stay stable so that consumers can rely
  // on the mount handlers (and refs) retaining their identity across renders.
  return useMemo(() => ({
    boardZoneRef,
    topDeckCardRef,
    bottomDeckCardRef,
    topTrashCardRef,
    bottomTrashCardRef,
    topHandRowRef,
    bottomHandRowRef,
    topHandAutoAnimateRef,
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
    topHandAutoAnimateRef,
    setTopHandRowRefs,
    setBottomHandRowRefs,
    setBoardZoneRef,
    setTopDeckCardRef,
    setBottomDeckCardRef,
    setTopTrashCardRef,
    setBottomTrashCardRef,
  ])
}

/**
 * The set of animations the phase-presentation acknowledgement has to wait for. Built as one unit so the
 * registration function always mutates the very map the acknowledgement reads.
 */
function createAnimationRegistry(): Pick<IGameViewAnimController, 'animationEndsAtByKey' | 'noteAnimation'> {
  const animationEndsAtByKey = new Map<string, number>()

  return {
    animationEndsAtByKey,
    noteAnimation: (key: string, endsAt: number) => {
      // Re-scheduling the same animation only ever pushes its deadline out: a later short flight must not
      // shorten the wait for a longer one already in the air.
      const existingEndsAt = animationEndsAtByKey.get(key)
      animationEndsAtByKey.set(
        key,
        existingEndsAt === undefined ? endsAt : Math.max(existingEndsAt, endsAt),
      )
    },
  }
}

export function useGameAnimationController() {
  return useRef<IGameViewAnimController>({
    ...createAnimationRegistry(),
    drawAnimationEndsAt: null,
    pendingDrawAnimationFrameId: null,
    pendingDrawTimeoutIds: [],
    pendingMulliganDrawReplay: false,
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
