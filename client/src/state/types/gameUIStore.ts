import type { SetStateAction } from 'react'
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
}

