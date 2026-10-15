import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { IPendingAttackVisualStateResponse, IPhasePresentationResponse } from '@/services/api/types/game'
import { runAttackLungeAnimation } from '@/views/game/animation/runAttackLunge'
import { toAnchorId } from '@/views/game/utils/functions'

/**
 * Plays the attacker's hit beat (the shake) exactly once per attack that resolves.
 *
 * The trigger is the engine-owned resolve stop - the `Damage` phase presentation - not the attack declaration:
 * the snapshot that announces the attack is the wrong moment, and it is also the one the arrow already shows.
 * The attacker/defender come from `pendingAttackVisualState`, so a leader defender (which is not a
 * character-field card) resolves through the same anchor lookup.
 */
function useAttackLungeEffect({
  pendingPresentation,
  attackVisualState,
  boardZoneRef,
}: IUseAttackLungeEffectArgs): void {
  const handledPresentationIdRef = useRef<string | null>(null)
  /**
   * The attack being resolved. Captured while `pendingAttackVisualState` is published, because the engine's
   * `Damage` stop can arrive after the pending attack has already been cleared from the snapshot - reading the
   * pair at stop time alone left the lunge silently doing nothing.
   */
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

    // `Damage` is only ever minted on entering the attack-resolution phase, so the last published pair is the
    // attack this stop is resolving.
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
      // Only the shake's first swing reads the defender (to swing towards the card being hit), so a defender
      // that is already gone - K.O.'d by this very attack, which unmounts it - must not swallow the hit beat.
      defenderElement: resolveCardElement(boardZoneRef.current, pair.defenderCardInstanceId),
      key: `attack-lunge:${pair.attackerCardInstanceId}`,
    })
  }, [boardZoneRef, pendingPresentation])
}

/**
 * A card by its instance id. Character-field and support cards carry `data-card-instance-id`, while a leader is
 * reached through its attack-link anchor id - so both are tried, and the document is searched as a last resort
 * because the defender may be a leader or sit outside the board subtree.
 */
function resolveCardElement(root: HTMLElement | null, instanceId: string): HTMLElement | null {
  if (!instanceId) {
    return null
  }

  return root?.querySelector<HTMLElement>(`[data-card-instance-id="${instanceId}"]`)
    ?? document.querySelector<HTMLElement>(`[data-card-instance-id="${instanceId}"]`)
    ?? document.getElementById(toAnchorId(instanceId))
}

interface IUseAttackLungeEffectArgs {
  /** The engine's outstanding transition; the lunge fires on the `Damage` kind. */
  pendingPresentation: IPhasePresentationResponse | null | undefined
  /** The attack being resolved: attacker + defender instance ids. */
  attackVisualState: IPendingAttackVisualStateResponse | null | undefined
  boardZoneRef: RefObject<HTMLDivElement | null>
}

export { useAttackLungeEffect }
