import type { SetStateAction } from 'react'
import type { IAttackFlowLinkState, IAttackTargetingState, IPendingCardTargetingState, ISummonTargetingState } from '@/views/game/types'

export type IGameUIStoreState = {
  bottomHandFaceUpByInstanceId: Record<string, boolean>
  setBottomHandFaceUpByInstanceId: (value: SetStateAction<Record<string, boolean>>) => void
  isMulliganAnimationPending: boolean
  setIsMulliganAnimationPending: (value: SetStateAction<boolean>) => void
  pendingSetSupportCardInstanceId: string | null
  setPendingSetSupportCardInstanceId: (value: SetStateAction<string | null>) => void
  cancelSetSupportSelection: () => void
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
  optimisticRestedByInstanceId: Record<string, boolean>
  setOptimisticRestedByInstanceId: (value: SetStateAction<Record<string, boolean>>) => void
  activeAttackLink: IAttackFlowLinkState | null
  setActiveAttackLink: (value: SetStateAction<IAttackFlowLinkState | null>) => void
  lastSubmittedAttackSourceInstanceId: string | null
  setLastSubmittedAttackSourceInstanceId: (value: SetStateAction<string | null>) => void
}

