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

  if (prefersReducedMotion()) {
    return Promise.resolve()
  }

  const amplitude = Math.min(
    ATTACK_LUNGE_SHAKE_MAX_AMPLITUDE_PX,
    attackerRect.width * ATTACK_LUNGE_SHAKE_AMPLITUDE_RATIO,
  )

  const defenderRect = defenderElement?.getBoundingClientRect() ?? null
  const hasDefenderBox = defenderRect !== null && defenderRect.width > 0 && defenderRect.height > 0
  const defenderIsAhead = hasDefenderBox
    && defenderRect.left + defenderRect.width / 2 >= attackerRect.left + attackerRect.width / 2
  const swingDirection = hasDefenderBox && !defenderIsAhead ? -1 : 1

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
    easing: ATTACK_LUNGE_SHAKE_EASING,
  })

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
