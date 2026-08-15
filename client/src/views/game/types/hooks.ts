import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { ILeaderCardViewModel } from '@/views/game/types/viewModels'
import type { IHandZoneSnapshot } from '@/views/game/types/animations'
import type { IGameHubActionIntent, ISubmitHubIntentRequest } from '@/views/game/types/hub'

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
  lastAutoSignalKey: string
  pendingDrawAnimationFrameId: number | null
  pendingDrawTimeoutIds: number[]
  pendingMulliganDrawReplay: boolean
  previousHandZoneSnapshot: IHandZoneSnapshot
}

export type IUseHandZoneAnimationEffectsArgs = {
  topHandInstanceIds: string[]
  bottomHandInstanceIds: string[]
  topDeckCount: number
  bottomDeckCount: number
  topTrashCount: number
  bottomTrashCount: number
  drawToHandStaggerMs: number
  drawToHandRevealDelayMs: number
  handToPileStaggerMs: number
  topDeckCardRef: RefObject<HTMLDivElement | null>
  bottomDeckCardRef: RefObject<HTMLDivElement | null>
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
  topHandRowRef: RefObject<HTMLDivElement | null>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
  animControllerRef: RefObject<IGameViewAnimController>
  setBottomHandFaceUpByInstanceId: Dispatch<SetStateAction<Record<string, boolean>>>
}

export type IUseAutoAdvancePhaseEffectArgs = {
  isConnected: boolean
  isActionPendingFlag: boolean
  hasPendingPromptFlag: boolean
  availableActions: Array<{ actionId: string; isEnabled: boolean }>
  phase: string
  turnNumber: number
  activePlayerId: string
  autoSignalPhases: ReadonlySet<string>
  animControllerRef: RefObject<IGameViewAnimController>
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  advancePhaseIntent?: IGameHubActionIntent
}
