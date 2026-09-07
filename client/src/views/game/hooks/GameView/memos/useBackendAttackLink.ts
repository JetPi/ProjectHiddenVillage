import type { IGameStateResponse } from "@/services/api/types/game"
import type { IAttackFlowLinkState } from "@/views/game/types"
import { normalizeCardInstanceId, normalizePlayerId } from "@/views/game/utils/functions"
import { useMemo } from "react"

function useBackendAttackLink({ gameState }: IBackendAttackLinkProps) {
     const backendAttackLink = useMemo<IAttackFlowLinkState | null>(() => {
    if (!gameState.isAttackSequencePending) {
      return null
    }

    const pendingAttackVisualState = gameState.pendingAttackVisualState
    if (!pendingAttackVisualState) {
      return null
    }

    const sourceCardInstanceId = pendingAttackVisualState.attackerCardInstanceId
    const sourceCardLookupId = normalizeCardInstanceId(sourceCardInstanceId)
    if (!sourceCardLookupId) {
      return null
    }

    const flattenedCharacterFieldCards = gameState.players.flatMap((player) => player.characterField)
    const sourceCardExists = flattenedCharacterFieldCards.some((card) =>
      normalizeCardInstanceId(card.instanceId) === sourceCardLookupId)

    if (!sourceCardExists) {
      return null
    }

    const normalizedDefenderPlayerId = normalizePlayerId(pendingAttackVisualState.defenderPlayerId)
    const defenderPlayer = gameState.players.find((player) => normalizePlayerId(player.playerId) === normalizedDefenderPlayerId)

    if (!defenderPlayer) {
      return null
    }

    const defenderZone = pendingAttackVisualState.defenderZone
    const pendingDefenderCardInstanceId = normalizeCardInstanceId(pendingAttackVisualState.defenderCardInstanceId)

    if (defenderZone === 'Leader') {
      return {
        sourceCardInstanceId,
        targetCardInstanceId: defenderPlayer.leader.instanceId,
        targetZone: defenderZone,
        targetPlayerId: defenderPlayer.playerId,
      }
    }

    const fallbackTargetCard = defenderPlayer.characterField.find((card) =>
      normalizeCardInstanceId(card.instanceId) === pendingDefenderCardInstanceId)

    if (!fallbackTargetCard) {
      return null
    }

    return {
      sourceCardInstanceId,
      targetCardInstanceId: fallbackTargetCard.instanceId,
      targetZone: defenderZone,
      targetPlayerId: defenderPlayer.playerId,
    }
  }, [gameState])

  return backendAttackLink
}

interface IBackendAttackLinkProps {
    gameState: IGameStateResponse,
}

export { useBackendAttackLink }