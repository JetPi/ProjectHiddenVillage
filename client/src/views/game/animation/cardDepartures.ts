import type { IGameStateResponse } from '@/services/api/types/game'

type ICardDepartureZone = 'trash' | 'deck'

function resolveCardDepartureZone(
  cardInstanceId: string,
  animationEvents: IGameStateResponse['animationEvents'],
): ICardDepartureZone | null {
  const movements = (animationEvents ?? []).filter((event) => event.cardInstanceId === cardInstanceId)
  const movement = movements.length > 0 ? movements[movements.length - 1] : null
  if (!movement) {
    return null
  }

  const toZone = movement.toZone?.toLowerCase() ?? ''
  if (toZone === 'trash') {
    return 'trash'
  }

  return toZone === 'deck' ? 'deck' : null
}

function resolveCardDepartureDestinationRect(
  zone: ICardDepartureZone,
  side: 'top' | 'bottom',
): DOMRect | null {
  const testId = zone === 'trash' ? 'trash-pile-card' : 'deck-pile-card'
  return document.querySelector<HTMLElement>(`[data-side="${side}"] [data-testid="${testId}"]`)?.getBoundingClientRect()
    ?? null
}

export type { ICardDepartureZone }
export { resolveCardDepartureZone, resolveCardDepartureDestinationRect }
