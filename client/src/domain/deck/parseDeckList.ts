import type { IDeckListParseResult } from './types'

const DECK_LINE_PATTERN = /^\s*(\d+)x\s+([A-Za-z0-9-]+)\s*$/

export function normalizeDeckCardId(cardId: string): string {
  return cardId.trim().toLowerCase()
}

export function parseDeckList(payload: string): IDeckListParseResult {
  const lines = payload.split(/\r?\n/)
  const quantitiesByCardId = new Map<string, number>()
  let hasContent = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim()

    if (line.length === 0) {
      continue
    }

    hasContent = true
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

  if (!hasContent) {
    return { isValid: false, error: { line: 0, code: 'empty' } }
  }

  return {
    isValid: true,
    cards: [...quantitiesByCardId.entries()]
      .map(([cardId, quantity]) => ({ cardId, quantity }))
      .sort((left, right) => left.cardId.localeCompare(right.cardId)),
  }
}

export function sumDeckCardQuantities(cards: readonly { quantity: number }[]): number {
  return cards.reduce((total, card) => total + card.quantity, 0)
}
