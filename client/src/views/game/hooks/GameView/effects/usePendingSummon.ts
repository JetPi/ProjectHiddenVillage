import type { IGameCardInstanceResponse } from "@/services/api/types/game"
import type { ISummonTargetingState } from "@/views/game/types"
import { useEffect, type Dispatch, type SetStateAction } from "react"

function usePendingSummon({
  pendingSummonTargeting,
  bottomHandCards,
  setPendingSummonTargeting,
}: IPendingSummonProps) {
    useEffect(() => {
    if (!pendingSummonTargeting) {
      return
    }

    const pendingActionId = pendingSummonTargeting.actionId
    const pendingCard = bottomHandCards.find((card) =>
      card.instanceId.trim().toLowerCase() === pendingSummonTargeting.sourceCardInstanceId.trim().toLowerCase())
    const matchingAction = (pendingCard?.availableActions ?? []).find((option) => option.actionId === pendingActionId)

    if (matchingAction?.isEnabled) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPendingSummonTargeting(null)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [bottomHandCards, pendingSummonTargeting, setPendingSummonTargeting])
}

interface IPendingSummonProps {
  pendingSummonTargeting: ISummonTargetingState | null,
  bottomHandCards: IGameCardInstanceResponse[],
  setPendingSummonTargeting: Dispatch<SetStateAction<ISummonTargetingState | null>>,
}

export { usePendingSummon }