import {
  ATTACK_LUNGE_DURATION_MS,
  ATTACK_LUNGE_SHAKE_AMPLITUDE_RATIO,
  ATTACK_LUNGE_SHAKE_DECAY,
  ATTACK_LUNGE_SHAKE_EASING,
  ATTACK_LUNGE_SHAKE_MAX_AMPLITUDE_PX,
  ATTACK_LUNGE_SHAKE_SWINGS,
} from './tuning'
import { registerFlight, unregisterFlight } from './flightRegistry'
import { noteFlight } from './boardAnimationDirector'
import { prefersReducedMotion } from './reducedMotion'

/**
 * The attacker's hit beat when an attack resolves: the card shakes left and right and settles back into its slot,
 * so "the attack happened" is visible on the board instead of only in the arrow and the phase banner.
 *
 * It used to make a single yoyo out along the attacker→defender vector, which read as a stutter: one eased
 * excursion looks like it is *about to* go somewhere and then thinks better of it. A decaying shake is the motion
 * this moment actually wants - it reads as impact, it never leaves the card's slot, and the softness comes from
 * the eased swings plus the decay instead of from a longer single move.
 *
 * It animates the card's own element. That is safe here in a way the retired zone flights were not: the inner
 * card node has no other transform owner (Motion owns the rested tilt and the layout offset on the wrapper),
 * and the flight registry gives the shake the element exclusively for its duration. The shake is also
 * registered with the director, so the phase-presentation acknowledgement waits for it like any other flight.
 */
function runAttackLungeAnimation({
  attackerElement,
  defenderElement,
  key,
}: {
  attackerElement: HTMLElement
  defenderElement: HTMLElement | null
  key: string
}): Promise<void> {
  const attackerRect = attackerElement.getBoundingClientRect()

  if (attackerRect.width <= 0 || attackerRect.height <= 0) {
    return Promise.resolve()
  }

  // A reduced-motion board shows no shake at all: the movement IS the cue, so there is nothing to trim it to.
  // It must not register a flight either, or the acknowledgement would wait on an animation that never plays.
  if (prefersReducedMotion()) {
    return Promise.resolve()
  }

  // A fraction of the card's own width, so the shake scales with the board, clamped so a small card still shows
  // it and a wide one cannot swing into its neighbours.
  const amplitude = Math.min(
    ATTACK_LUNGE_SHAKE_MAX_AMPLITUDE_PX,
    attackerRect.width * ATTACK_LUNGE_SHAKE_AMPLITUDE_RATIO,
  )

  // The first swing goes towards the defender while we still have its box, so the hit reads as aimed at the card
  // it resolves against. The shake itself is horizontal and needs nothing from the target: a defender that is
  // already gone (K.O.'d by this very attack) only means there is no side to prefer.
  const defenderRect = defenderElement?.getBoundingClientRect() ?? null
  const hasDefenderBox = defenderRect !== null && defenderRect.width > 0 && defenderRect.height > 0
  const defenderIsAhead = hasDefenderBox
    && defenderRect.left + defenderRect.width / 2 >= attackerRect.left + attackerRect.width / 2
  const swingDirection = hasDefenderBox && !defenderIsAhead ? -1 : 1

  // The swing distances decay, so the card is already settling by the end instead of stopping dead, and the
  // first and last frames are exactly where the card stood: the animation borrows the element's own transform
  // while React keeps re-rendering it, so it has to give it back untouched.
  const swings = Array.from({ length: ATTACK_LUNGE_SHAKE_SWINGS }, (_, index) => {
    const distance = amplitude * ATTACK_LUNGE_SHAKE_DECAY ** index
    const offsetX = index % 2 === 0 ? distance * swingDirection : -distance * swingDirection

    return { transform: `translate(${offsetX.toFixed(2)}px, 0px)` }
  })
  const keyframes = [
    { transform: 'translate(0px, 0px)' },
    ...swings,
    { transform: 'translate(0px, 0px)' },
  ]

  const previousTransform = attackerElement.style.transform
  const previousZIndex = attackerElement.style.zIndex
  attackerElement.style.zIndex = '260'

  const animation = attackerElement.animate(keyframes, {
    duration: ATTACK_LUNGE_DURATION_MS,
    // Web Animations applies the easing to *every* segment, which is what turns the swing sequence into a shake
    // that eases in and out of each side instead of snapping between them.
    easing: ATTACK_LUNGE_SHAKE_EASING,
  })

  // The acknowledgement has to wait for the shake: it is part of presenting the damage stop.
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
