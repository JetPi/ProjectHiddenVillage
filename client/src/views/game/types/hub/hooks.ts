import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { IAnimationEventResponse, IGamePlayerStateResponse, IPhasePresentationResponse } from '@/services/api/types/game'
import type { ILeaderCardViewModel } from './viewModels'
import type { IHandZoneSnapshot } from '@/views/game/types'

export type IRevalidatorState = 'idle' | 'loading'

export type IUseAlignedSplitOptions = {
  splitStartVar?: string
  splitEndVar?: string
  halfBandPercent?: number
}

export type ILeaderCardsViewModel = {
  topLeaderCard: ILeaderCardViewModel | null
  bottomLeaderCard: ILeaderCardViewModel | null
  topLeaderCardFrameClassName: string
  bottomLeaderCardFrameClassName: string
}

export type IGameViewAnimController = {
  whenIdle: () => Promise<void>
  handledAnimationEventIds: Set<string>
  drawAnimationEndsAt: number | null
  pendingDrawAnimationFrameId: number | null
  pendingDrawTimeoutIds: number[]
  pendingMulliganDrawReplay: boolean
  pendingMulliganDrawReplayExpiresAtMs: number
  previousHandZoneSnapshot: IHandZoneSnapshot
  suppressedExitGhostInstanceIds: Set<string>
}

export type IUseHandZoneAnimationEffectsArgs = {
  topHandInstanceIds: string[]
  bottomHandInstanceIds: string[]
  topDeckCount: number
  bottomDeckCount: number
  topTrashCount: number
  bottomTrashCount: number
  topTrashInstanceIds: string[]
  bottomTrashInstanceIds: string[]
  drawToHandStaggerMs: number
  drawToHandRevealDelayMs: number
  handToPileStaggerMs: number
  animationEvents?: IAnimationEventResponse[] | null
  topDeckCardRef: RefObject<HTMLDivElement | null>
  bottomDeckCardRef: RefObject<HTMLDivElement | null>
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
  topHandRowRef: RefObject<HTMLDivElement | null>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
  animControllerRef: RefObject<IGameViewAnimController>
  setBottomHandFaceUpByInstanceId: Dispatch<SetStateAction<Record<string, boolean>>>
}

export type IPlayerCardZoneInstanceIds = {
  characterField: string[]
  supportZone: string[]
  hand: string[]
  trash: string[]
}

export type IUseCardMoveGhostAnimationEffectArgs = {
  topPlayerCardInstanceIds: IPlayerCardZoneInstanceIds
  bottomPlayerCardInstanceIds: IPlayerCardZoneInstanceIds
  boardZoneRef: RefObject<HTMLDivElement | null>
  topHandRowRef: RefObject<HTMLDivElement | null>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
  animControllerRef: RefObject<IGameViewAnimController>
}

export type IUseRevealedCardSummonFlightEffectArgs = {
  currentPlayer: IGamePlayerStateResponse | null
  opponentPlayer: IGamePlayerStateResponse | null
  topDeckCardRef: RefObject<HTMLDivElement | null>
  bottomDeckCardRef: RefObject<HTMLDivElement | null>
  boardZoneRef: RefObject<HTMLDivElement | null>
  animationEvents?: IAnimationEventResponse[] | null
  animControllerRef: RefObject<IGameViewAnimController>
}

export type IUseTrashRecallSummonFlightEffectArgs = {
  currentPlayer: IGamePlayerStateResponse | null
  opponentPlayer: IGamePlayerStateResponse | null
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
  boardZoneRef: RefObject<HTMLDivElement | null>
}

export type IUsePhasePresentationAckEffectArgs = {
  isConnected: boolean
  authUserId?: string
  pendingPresentation: IPhasePresentationResponse | null | undefined
  acknowledgePhasePresentation: (presentationId: string) => Promise<boolean>
}
