import type { IGameStateResponse } from '@/services/api/types/game'

/**
 * Where a card that just left a rendered zone is going, so the *card itself* can travel there.
 *
 * A zone row cannot animate a card it has already stopped rendering, and the state update that removes the card
 * is the same push that carries the movement that explains it - so the row reads the movement from the events
 * (newest first for that instance, because the bounded tail can hold several movements of one card) and keeps the
 * card rendered only when there is somewhere for it to go.
 *
 * A zone the board draws no landing box for (exile) returns `null`: the card simply goes, which is honest, and
 * better than holding it on screen waiting for something that will not happen.
 */
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

  // The wire vocabulary is the engine's own zone names, so it arrives capitalised (`Trash`, `Deck`): the server
  // derives them from `PlayerZone.ToString()` rather than re-typing them. Compare case-insensitively instead of
  // assuming a casing here - an exact-match bug in this one line silently disabled every departure travel.
  const toZone = movement.toZone?.toLowerCase() ?? ''
  if (toZone === 'trash') {
    return 'trash'
  }

  return toZone === 'deck' ? 'deck' : null
}

/** The pile slot a departing card lands on: the box it is drawn inside once it settles. */
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
