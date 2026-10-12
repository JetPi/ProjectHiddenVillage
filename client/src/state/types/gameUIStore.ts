import type { SetStateAction } from 'react'
import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { IAttackFlowLinkState, IAttackTargetingState, IEffectTargetingState, IPendingCardTargetingState, ISummonTargetingState } from '@/views/game/types'

export type IPendingPromptSelectionState = {
  promptId: string
  selectedInstanceId: string
}

export type IGameUIStoreState = {
  bottomHandFaceUpByInstanceId: Record<string, boolean>
  setBottomHandFaceUpByInstanceId: (value: SetStateAction<Record<string, boolean>>) => void
  isMulliganAnimationPending: boolean
  setIsMulliganAnimationPending: (value: SetStateAction<boolean>) => void
  /**
   * A card the player picked to answer an effect selection prompt ("select a card to place on deck top").
   * Picking happens on the card's own Select button; a side effect then submits `resolve-prompt` on the hub.
   */
  pendingPromptSelection: IPendingPromptSelectionState | null
  clearPromptSelection: () => void
  pendingCardTargeting: IPendingCardTargetingState | null
  setPendingCardTargeting: (value: SetStateAction<IPendingCardTargetingState | null>) => void
  beginBattleTargeting: (targeting: IAttackTargetingState) => void
  beginEffectTargeting: (targeting: IAttackTargetingState) => void
  cancelBattleTargeting: () => void
  pendingSummonTargeting: ISummonTargetingState | null
  setPendingSummonTargeting: (value: SetStateAction<ISummonTargetingState | null>) => void
  beginSummonTargeting: (targeting: ISummonTargetingState) => void
  cancelSummonTargeting: () => void
  toggleSummonTarget: (targetCardInstanceId: string) => void
  pendingEffectTargeting: IEffectTargetingState | null
  setPendingEffectTargeting: (value: SetStateAction<IEffectTargetingState | null>) => void
  beginEffectMultiTargeting: (targeting: IEffectTargetingState) => void
  cancelEffectTargeting: () => void
  toggleEffectTarget: (targetCardInstanceId: string) => void
  optimisticRestedByInstanceId: Record<string, boolean>
  setOptimisticRestedByInstanceId: (value: SetStateAction<Record<string, boolean>>) => void
  activeAttackLink: IAttackFlowLinkState | null
  setActiveAttackLink: (value: SetStateAction<IAttackFlowLinkState | null>) => void
  lastSubmittedAttackSourceInstanceId: string | null
  setLastSubmittedAttackSourceInstanceId: (value: SetStateAction<string | null>) => void
  /**
   * True while the engine is holding a phase presentation this board has to answer: the transition just
   * happened, the state is mid-flight, and the HUD holds its last interactive content instead of redrawing for a
   * phase whose only published entry would be the system `advance-phase` action (which the automation does not
   * publish at all).
   */
  isPhasePresentationPending: boolean
  setIsPhasePresentationPending: (value: SetStateAction<boolean>) => void
  /**
   * The global action list as it last looked on an interactive snapshot. The phase row paints this
   * instead of the live list while `isPhasePresentationPending`, which is what keeps the chips - and the
   * strip's open/close transition - still through the whole engine-driven chain.
   */
  retainedInteractiveAvailableActions: IGameActionOptionResponse[]
  setRetainedInteractiveAvailableActions: (value: SetStateAction<IGameActionOptionResponse[]>) => void
  /**
   * Whether an action was in flight when the last interactive snapshot was taken. The sidebar reads
   * this instead of the live flag while `isPhasePresentationPending`, so its buttons are not dimmed by an
   * acknowledgement or a refresh landing in the middle of a transition.
   */
  retainedIsActionBlocked: boolean
  setRetainedIsActionBlocked: (value: SetStateAction<boolean>) => void
}

