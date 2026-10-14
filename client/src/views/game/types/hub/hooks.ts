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
  /**
   * Resolves when the director's flight registry has drained (immediately when nothing is in flight). The
   * phase-presentation acknowledgement waits on this instead of inspecting individual animations, so a new kind
   * of animation cannot forget to register and the engine never resumes while a card is still in the air. The
   * registry itself lives in `views/game/animation/boardAnimationDirector.ts`.
   */
  whenIdle: () => Promise<void>
  /**
   * The animation-event ids already consumed. The server republishes a bounded tail of recent card movements on
   * every push, so a consumer must animate each event exactly once; the ids live on the controller (a mutable
   * ref bag) because consuming an event must not re-render and they have to survive across pushes.
   */
  handledAnimationEventIds: Set<string>
  drawAnimationEndsAt: number | null
  pendingDrawAnimationFrameId: number | null
  pendingDrawTimeoutIds: number[]
  pendingMulliganDrawReplay: boolean
  /**
   * When the pending mulligan replay stops being valid (`Date.now()`-based).
   *
   * The flag has to survive until the push that actually carries the replacement hand: a mulligan resolves the
   * prompt, moves the phase and republishes the hand, and those can be separate pushes. Consuming the flag on the
   * first one left the redraw with no batch to fly, so the new hand simply appeared. The deadline keeps a flag
   * that never finds its hand from leaking into a later draw.
   */
  pendingMulliganDrawReplayExpiresAtMs: number
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
  /**
   * The engine's recorded card movements. When present they are the authoritative source for which card drew,
   * and the count/id inference below is only the fallback for a push that carries none.
   */
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
  /** The engine's recorded card movements; a `summon` whose source zone is the deck starts this flight. */
  animationEvents?: IAnimationEventResponse[] | null
  /** The board's animation registry: the movement is claimed through it so it is animated exactly once. */
  animControllerRef: RefObject<IGameViewAnimController>
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
  /** Sends the acknowledgement (never through `submitHubIntent`, so it cannot set the pending flag). */
  acknowledgePhasePresentation: (presentationId: string) => Promise<boolean>
}
