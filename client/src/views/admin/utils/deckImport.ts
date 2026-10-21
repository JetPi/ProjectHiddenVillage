import type { IDeckCardInput } from '@/types/deck'
import type { IDeckAdminImportParseResult } from '@/views/admin/types/deckAdminTypes'
import { normalizeDeckCardId } from '@/views/admin/utils/deckDraftValidation'

const DECK_LINE_PATTERN = /^\s*(\d+)x\s+([A-Za-z0-9-]+)\s*$/

export function parseDeckImportPayload(cardsPayload: string): IDeckAdminImportParseResult {
  const lines = cardsPayload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return { isValid: false, error: { line: 0, code: 'empty' } }
  }

  const quantitiesByCardId = new Map<string, number>()

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = DECK_LINE_PATTERN.exec(line)

    if (!match) {
      return { isValid: false, error: { line: index + 1, code: 'invalidLine', value: line } }
    }

    const quantity = Number.parseInt(match[1], 10)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { isValid: false, error: { line: index + 1, code: 'nonPositiveQuantity' } }
    }

    const cardId = normalizeDeckCardId(match[2])
    quantitiesByCardId.set(cardId, (quantitiesByCardId.get(cardId) ?? 0) + quantity)
  }

  return {
    isValid: true,
    cards: [...quantitiesByCardId.entries()].map(([cardId, quantity]) => ({ cardId, quantity })),
  }
}

export function mergeImportedDeckCards(
  quantitiesByCardId: ReadonlyMap<string, number>,
  importedCards: readonly IDeckCardInput[],
): Map<string, number> {
  const merged = new Map(quantitiesByCardId)

  for (const card of importedCards) {
    const cardId = normalizeDeckCardId(card.cardId)
    if (!cardId || card.quantity <= 0) {
      continue
    }

    merged.set(cardId, (merged.get(cardId) ?? 0) + card.quantity)
  }

  return merged
}
