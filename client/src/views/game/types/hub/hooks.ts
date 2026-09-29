import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { IGamePlayerStateResponse } from '@/services/api/gameApi'
import type { ILeaderCardViewModel } from './viewModels'
import type { IHandZoneSnapshot } from '@/views/game/types'
import type { IGameHubActionIntent, ISubmitHubIntentRequest } from './hub'

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
  drawAnimationEndsAt: number | null
  pendingDrawAnimationFrameId: number | null
  pendingDrawTimeoutIds: number[]
  pendingMulliganDrawReplay: boolean
  previousHandZoneSnapshot: IHandZoneSnapshot
  // Instance ids whose battlefield/hand exit is already animated by an explicit ghost (tribute summons):
  // the generic exit-to-trash effect consumes the id and skips it, so a card never flies twice.
  suppressedExitGhostInstanceIds: Set<string>
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

/**
 * Flies the card a reveal turned face up out of the deck slot and onto its owner's character field (a
 * "Reveal First" chain that summons the revealed card). Driven purely by the reveal: the card is drawn by the
 * deck pile rather than as a card face, so the generic move-ghost effect has no snapshot to fly from.
 */
export type IUseRevealedCardSummonFlightEffectArgs = {
  currentPlayer: IGamePlayerStateResponse | null
  opponentPlayer: IGamePlayerStateResponse | null
  topDeckCardRef: RefObject<HTMLDivElement | null>
  bottomDeckCardRef: RefObject<HTMLDivElement | null>
  boardZoneRef: RefObject<HTMLDivElement | null>
}

export type IUseAutoAdvancePhaseEffectArgs = {
  isConnected: boolean
  isActionPendingFlag: boolean
  hasPendingPromptFlag: boolean
  availableActions: Array<{ actionId: string; isEnabled: boolean }>
  phase: string
  turnNumber: number
  activePlayerId: string
  animControllerRef: RefObject<IGameViewAnimController>
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  advancePhaseIntent?: IGameHubActionIntent
}
