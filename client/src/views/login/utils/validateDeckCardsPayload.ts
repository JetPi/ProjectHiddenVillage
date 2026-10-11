import i18n from '@/i18n'
import type { IDeckCardsValidationResult } from '@/views/login/types/deckValidation'

const DECK_LINE_PATTERN = /^\s*(\d+)x\s+([A-Za-z0-9-]+)\s*$/

export function validateDeckCardsPayload(cardsPayload: string): IDeckCardsValidationResult {
  const lines = cardsPayload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return {
      isValid: false,
      message: i18n.t('auth.errors.deckEmpty'),
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = DECK_LINE_PATTERN.exec(line)

    if (!match) {
      return {
        isValid: false,
        message: i18n.t('auth.errors.deckInvalidLine', { line: index + 1, value: line }),
      }
    }

    const quantity = Number.parseInt(match[1], 10)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return {
        isValid: false,
        message: i18n.t('auth.errors.deckPositiveQuantity', { line: index + 1 }),
      }
    }
  }

  return { isValid: true }
}