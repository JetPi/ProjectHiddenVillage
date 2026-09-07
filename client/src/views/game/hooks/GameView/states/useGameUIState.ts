import { useState } from 'react';
import type { IPendingCardTargetingState, ISummonTargetingState, IAttackFlowLinkState } from '@/views/game/types';

export function useGameUIState() {
  const [bottomHandFaceUpByInstanceId, setBottomHandFaceUpByInstanceId] = useState<Record<string, boolean>>({});
  const [isMulliganAnimationPending, setIsMulliganAnimationPending] = useState(false);
  const [pendingSetSupportCardInstanceId, setPendingSetSupportCardInstanceId] = useState<string | null>(null);
  const [pendingCardTargeting, setPendingCardTargeting] = useState<IPendingCardTargetingState | null>(null);
  const [pendingSummonTargeting, setPendingSummonTargeting] = useState<ISummonTargetingState | null>(null);
  const [optimisticRestedByInstanceId, setOptimisticRestedByInstanceId] = useState<Record<string, boolean>>({});
  const [activeAttackLink, setActiveAttackLink] = useState<IAttackFlowLinkState | null>(null);

  return {
    bottomHandFaceUpByInstanceId,
    setBottomHandFaceUpByInstanceId,
    isMulliganAnimationPending,
    setIsMulliganAnimationPending,
    pendingSetSupportCardInstanceId,
    setPendingSetSupportCardInstanceId,
    pendingCardTargeting,
    setPendingCardTargeting,
    pendingSummonTargeting,
    setPendingSummonTargeting,
    optimisticRestedByInstanceId,
    setOptimisticRestedByInstanceId,
    activeAttackLink,
    setActiveAttackLink,
  };
}