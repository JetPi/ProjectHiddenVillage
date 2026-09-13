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

    // The attacker can be a battlefield character *or* the leader, so the source lookup must consider
    // both (mirrors the engine's FindOwnedCardInstance logic). Looking only at the character field
    // dropped the attack-link arrow for leader-declared attacks.
    const sourceCardExists = gameState.players.some((player) =>
      normalizeCardInstanceId(player.leader.instanceId) === sourceCardLookupId
      || player.characterField.some((card) =>
        normalizeCardInstanceId(card.instanceId) === sourceCardLookupId),
    )

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