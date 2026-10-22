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
  // A shake is the *declaration's* motion, so this board may only play it for an attack it watched get declared.
  // Two things can make a reloaded board play it anyway, and both are history it never saw:
  //
  //  - the damage presentation was already pending at mount (the old page's ack died with it, or it is waiting on
  //    the other player) - so its id is adopted as handled, exactly like the recorded movement tail
  //    (`useAdoptRecordedAnimationEventsOnMount`); the presentation still resolves, it just does not re-animate;
  //  - the attack was already declared before the mount (a reload inside the cut-in window): the damage step lands
  //    *after* the mount and would shake an attacker whose swing this page never showed. That is the reported
  //    "the completed attack shook again after I refreshed", so an attack that was already pending at mount never
  //    lunges on this page - the arrow it mounts with is the whole story.
  const handledPresentationIdRef = useRef<string | null>(pendingPresentation?.presentationId ?? null)
  const mountedDuringPendingAttackRef = useRef<boolean>(
    (attackVisualState?.attackerCardInstanceId ?? '').length > 0,
  )
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

    if (mountedDuringPendingAttackRef.current) {
      return
    }

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
