import type { IDeckCardsValidationResult } from '../types/deckValidation'

const DECK_LINE_PATTERN = /^\s*(\d+)x\s+([A-Za-z0-9-]+)\s*$/

export function validateDeckCardsPayload(cardsPayload: string): IDeckCardsValidationResult {
  const lines = cardsPayload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return {
      isValid: false,
      message: 'Please paste at least one deck line (example: 1x N-001).',
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = DECK_LINE_PATTERN.exec(line)

    if (!match) {
      return {
        isValid: false,
        message: `Invalid deck line ${index + 1}: "${line}". Expected format like "1x N-001".`,
      }
    }

    const quantity = Number.parseInt(match[1], 10)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        isValid: false,
        message: `Deck line ${index + 1} must use a positive quantity.`,
      }
    }
  }

  return { isValid: true }
}