/**
 * A remembered deck id only means something while the deck still exists: a saved deck can be deleted and a public one
 * can be withdrawn between visits. When it is gone the selection is cleared rather than replaced, so the player
 * chooses instead of quietly queueing with a deck they did not pick.
 *
 * `hasLoadedOptions` separates "there is no such deck" from "the list has not arrived yet": clearing on the first
 * paint would throw away a perfectly good selection every time the view mounts.
 */
export function resolvePersistedDeckSelection(
  rememberedDeckId: string,
  availableDeckIds: readonly string[],
  hasLoadedOptions: boolean,
): string {
  const normalizedDeckId = rememberedDeckId.trim()

  if (normalizedDeckId.length === 0 || !hasLoadedOptions) {
    return rememberedDeckId
  }

  return availableDeckIds.some((deckId) => deckId === normalizedDeckId) ? rememberedDeckId : ''
}
