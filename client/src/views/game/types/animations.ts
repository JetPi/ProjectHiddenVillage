import type { RefObject } from 'react'

export type IDeckToHandAnimationArgs = {
  side: 'top' | 'bottom'
  cardInstanceId: string
  topDeckCardRef: RefObject<HTMLDivElement | null>
  bottomDeckCardRef: RefObject<HTMLDivElement | null>
  topHandRowRef: RefObject<HTMLDivElement | null>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
}

export type IHandToPileAnimationArgs = {
  side: 'top' | 'bottom'
  destination: 'deck' | 'trash'
  cardInstanceId: string
  topDeckCardRef: RefObject<HTMLDivElement | null>
  bottomDeckCardRef: RefObject<HTMLDivElement | null>
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
  topHandRowRef: RefObject<HTMLDivElement | null>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
}

export type IHandZoneSnapshot = {
  topHandInstanceIds: Set<string>
  bottomHandInstanceIds: Set<string>
  topDeckCount: number
  bottomDeckCount: number
  topTrashCount: number
  bottomTrashCount: number
  isInitialized: boolean
}
