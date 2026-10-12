import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { IGamePlayerStateResponse, IPhasePresentationResponse } from '@/services/api/types/game'
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
  /**
   * The animations the board is playing right now, keyed by the animation, valued by the timestamp they are
   * expected to finish at. The phase-presentation acknowledgement waits on this instead of on a fixed delay, so a
   * client never tells the engine "I am done animating" while a card is still in the air. Entries are pruned as
   * their deadlines pass.
   */
  animationEndsAtByKey: Map<string, number>
  /**
   * Registers a flight the acknowledgement has to wait for. A key that is already registered is extended, never
   * shortened, so a re-scheduled animation of the same kind cannot cut a longer one short.
   */
  noteAnimation: (key: string, endsAt: number) => void
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
  // Which card each side's trash now holds: a card that left the hand is only flown into the trash when it is
  // actually there (see `useHandZoneAnimationEffects`).
  topTrashInstanceIds: string[]
  bottomTrashInstanceIds: string[]
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

/**
 * Flies a card summoned out of the trash (Gamabunta's "[On Summon] summon 1 [named] card from your trash")
 * from the trash slot onto its owner's character field. A truthy trash→field move is invisible to the generic
 * move-ghost effect - the trash card is drawn as a pile tile, not a card face - so the flight is driven by the
 * trash list itself, exactly as the reveal flight is driven by the deck list.
 */
export type IUseTrashRecallSummonFlightEffectArgs = {
  currentPlayer: IGamePlayerStateResponse | null
  opponentPlayer: IGamePlayerStateResponse | null
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
  boardZoneRef: RefObject<HTMLDivElement | null>
}

export type IUsePhasePresentationAckEffectArgs = {
  isConnected: boolean
  /** The local player: only the required participants acknowledge, and each one exactly once. */
  authUserId?: string
  /** The engine's outstanding transition, or null when the board is free to act. */
  pendingPresentation: IPhasePresentationResponse | null | undefined
  /** The board's animation registry: the acknowledgement waits for the flights it lists. */
  animControllerRef: RefObject<IGameViewAnimController>
  /** Sends the acknowledgement (never through `submitHubIntent`, so it cannot set the pending flag). */
  acknowledgePhasePresentation: (presentationId: string) => Promise<boolean>
}
