import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { IPendingAttackVisualStateResponse, IPhasePresentationResponse } from '@/services/api/types/game'
import { runAttackLungeAnimation } from '@/views/game/animation/runAttackLunge'
import { toAnchorId } from '@/views/game/utils/functions'

function useAttackLungeEffect({
  pendingPresentation,
  attackVisualState,
  boardZoneRef,
}: IUseAttackLungeEffectArgs): void {
  const handledPresentationIdRef = useRef<string | null>(null)
  const attackPairRef = useRef<{ attackerCardInstanceId: string; defenderCardInstanceId: string } | null>(null)

  useEffect(() => {
    const attackerCardInstanceId = attackVisualState?.attackerCardInstanceId ?? ''
    const defenderCardInstanceId = attackVisualState?.defenderCardInstanceId ?? ''
    if (attackerCardInstanceId && defenderCardInstanceId) {
      attackPairRef.current = { attackerCardInstanceId, defenderCardInstanceId }
    }
  }, [attackVisualState])

  useEffect(() => {
    const presentationId = pendingPresentation?.presentationId ?? null
    if (!presentationId || pendingPresentation?.kind !== 'Damage') {
      return
    }

    if (handledPresentationIdRef.current === presentationId) {
      return
    }
    handledPresentationIdRef.current = presentationId

    const pair = attackPairRef.current
    if (!pair) {
      return
    }

    const attackerElement = resolveCardElement(boardZoneRef.current, pair.attackerCardInstanceId)
    if (!attackerElement) {
      return
    }

    void runAttackLungeAnimation({
      attackerElement,
      defenderElement: resolveCardElement(boardZoneRef.current, pair.defenderCardInstanceId),
      key: `attack-lunge:${pair.attackerCardInstanceId}`,
    })
  }, [boardZoneRef, pendingPresentation])
}

function resolveCardElement(root: HTMLElement | null, instanceId: string): HTMLElement | null {
  if (!instanceId) {
    return null
  }

  return root?.querySelector<HTMLElement>(`[data-card-instance-id="${instanceId}"]`)
    ?? document.querySelector<HTMLElement>(`[data-card-instance-id="${instanceId}"]`)
    ?? document.getElementById(toAnchorId(instanceId))
}

interface IUseAttackLungeEffectArgs {
  pendingPresentation: IPhasePresentationResponse | null | undefined
  attackVisualState: IPendingAttackVisualStateResponse | null | undefined
  boardZoneRef: RefObject<HTMLDivElement | null>
}

export { useAttackLungeEffect }
