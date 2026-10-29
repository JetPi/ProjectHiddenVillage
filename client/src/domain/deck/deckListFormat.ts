import type { IDeckCardInput } from '@/types/deck'

/**
 * A deck as the import window's text: one `Nx CARD` line per card.
 *
 * This is the inverse of `parseDeckList`, so it lives next to it: the import parser accepts exactly this shape
 * (`3x N-001`), which is also what the deck create endpoint reads. Anything exported from the admin deck editor can
 * therefore be pasted straight into the import tab, or into a deck list shared with another player.
 */
export function formatDeckAsImportText(cards: readonly IDeckCardInput[]): string {
  return cards
    .filter((card) => Number.isFinite(card.quantity) && card.quantity > 0 && card.cardId.trim().length > 0)
    .map((card) => `${Math.trunc(card.quantity)}x ${card.cardId.trim()}`)
    .join('\n')
}
