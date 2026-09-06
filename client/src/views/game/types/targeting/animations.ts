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

export type IHandToElementAnimationArgs = {
  side: 'top' | 'bottom'
  cardInstanceId: string
  destinationElement: HTMLElement | null
  topHandRowRef: RefObject<HTMLDivElement | null>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
}

export type IRectToElementAnimationArgs = {
  sourceRect: DOMRect
  destinationElement: HTMLElement | null
  durationMs?: number
}

export type IWaitForElementArgs = {
  resolveElement: () => HTMLElement | null
  timeoutMs?: number
  maxFrames?: number
}

export type IRectToDynamicElementAnimationArgs = {
  sourceRect: DOMRect
  resolveDestinationElement: () => HTMLElement | null
  resolveFallbackElement?: () => HTMLElement | null
  durationMs?: number
  timeoutMs?: number
  maxFrames?: number
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
