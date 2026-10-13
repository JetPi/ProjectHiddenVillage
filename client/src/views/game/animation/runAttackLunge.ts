import {
  ATTACK_LUNGE_DURATION_MS,
  ATTACK_LUNGE_MAX_TRAVEL_PX,
  ATTACK_LUNGE_TRAVEL_RATIO,
  STANDARD_MOVEMENT_EASING,
} from './tuning'
import { registerFlight, unregisterFlight } from './flightRegistry'
import { noteFlight } from './boardAnimationDirector'
import { prefersReducedMotion } from './reducedMotion'

/**
 * The attacker's lunge when an attack resolves: the card travels along the attacker→defender vector and back,
 * so "the attack happened" is visible on the board instead of only in the arrow and the phase banner.
 *
 * It animates the card's own element. That is safe here in a way the retired zone flights were not: the inner
 * card node has no other transform owner (Motion owns the rested tilt and the layout offset on the wrapper),
 * and the flight registry gives the lunge the element exclusively for its duration. The lunge is also
 * registered with the director, so the phase-presentation acknowledgement waits for it like any other flight.
 */
function runAttackLungeAnimation({
  attackerElement,
  defenderElement,
  key,
}: {
  attackerElement: HTMLElement
  defenderElement: HTMLElement
  key: string
}): Promise<void> {
  const attackerRect = attackerElement.getBoundingClientRect()
  const defenderRect = defenderElement.getBoundingClientRect()

  if (attackerRect.width <= 0 || attackerRect.height <= 0 || defenderRect.width <= 0 || defenderRect.height <= 0) {
    return Promise.resolve()
  }

  const deltaX = (defenderRect.left + defenderRect.width / 2) - (attackerRect.left + attackerRect.width / 2)
  const deltaY = (defenderRect.top + defenderRect.height / 2) - (attackerRect.top + attackerRect.height / 2)
  const gap = Math.hypot(deltaX, deltaY)
  if (gap <= 0) {
    return Promise.resolve()
  }

  // A reduced-motion board shows no lunge at all: the movement IS the cue, so there is nothing to trim it to.
  // It must not register a flight either, or the acknowledgement would wait on an animation that never plays.
  if (prefersReducedMotion()) {
    return Promise.resolve()
  }

  const travel = Math.min(ATTACK_LUNGE_MAX_TRAVEL_PX, gap * ATTACK_LUNGE_TRAVEL_RATIO)
  const translateX = (deltaX / gap) * travel
  const translateY = (deltaY / gap) * travel

  const previousTransform = attackerElement.style.transform
  const previousZIndex = attackerElement.style.zIndex
  attackerElement.style.zIndex = '260'

  const animation = attackerElement.animate(
    [
      { transform: 'translate(0px, 0px)' },
      { transform: `translate(${translateX}px, ${translateY}px)`, offset: 0.45 },
      { transform: 'translate(0px, 0px)' },
    ],
    {
      duration: ATTACK_LUNGE_DURATION_MS,
      easing: STANDARD_MOVEMENT_EASING,
    },
  )

  // The acknowledgement has to wait for the lunge: it is part of presenting the damage stop.
  noteFlight(key, Date.now() + ATTACK_LUNGE_DURATION_MS)

  return new Promise<void>((resolve) => {
    let hasSettled = false

    const cleanup = () => {
      if (hasSettled) {
        return
      }
      hasSettled = true
      unregisterFlight(key, animation)
      attackerElement.style.transform = previousTransform
      attackerElement.style.zIndex = previousZIndex
      resolve()
    }

    animation.onfinish = cleanup
    animation.oncancel = cleanup
    registerFlight({ key, element: attackerElement, animation })
  })
}

export { runAttackLungeAnimation }
