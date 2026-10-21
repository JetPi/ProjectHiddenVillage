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
  isPhasePresentationPending: boolean
  setIsPhasePresentationPending: (value: SetStateAction<boolean>) => void
  retainedInteractiveAvailableActions: IGameActionOptionResponse[]
  setRetainedInteractiveAvailableActions: (value: SetStateAction<IGameActionOptionResponse[]>) => void
  retainedIsActionBlocked: boolean
  setRetainedIsActionBlocked: (value: SetStateAction<boolean>) => void
  isSupportWindowHudHolding: boolean
  setIsSupportWindowHudHolding: (value: SetStateAction<boolean>) => void
}

