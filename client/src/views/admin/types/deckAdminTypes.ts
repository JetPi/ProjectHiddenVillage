import type { IDeckCardInput } from '@/types/deck'

/**
 * The editor's working copy. Card ids are normalised to lowercase keys so a card added from a tile and the same
 * card loaded from a deck cannot become two lines, and quantities are separate from the catalogue so the draft
 * survives filter changes and refetches.
 */
export type IDeckAdminDraft = {
  name: string
  quantitiesByCardId: ReadonlyMap<string, number>
}

/**
 * The card fields the editor needs: a tile's art and name, and the type/colour the deck rules read. Both the
 * catalogue listing row and a populated deck's full card satisfy this.
 */
export type IDeckAdminCardMetadata = {
  id: string
  displayName: string
  type: string
  color: string
  image: string
  imageVersion?: number | null
}

/**
 * The client mirror of the server's `Deck.Public.*` rules. These codes exist so the editor can list the same
 * problems the server would answer with, without parsing server prose.
 */
export type IDeckAdminViolationCode =
  | 'nameRequired'
  | 'nameTooLong'
  | 'deckEmpty'
  | 'unknownCards'
  | 'unsupportedCardType'
  | 'leaderCount'
  | 'leaderCopies'
  | 'tooManyCopies'
  | 'colorMismatch'

export type IDeckAdminViolation = {
  code: IDeckAdminViolationCode
  /** i18n key under `admin.decks.validation.`; the pane translates it with `params`. */
  messageKey: string
  params?: Record<string, string | number>
}

export type IDeckAdminValidationResult = {
  isValid: boolean
  violations: IDeckAdminViolation[]
}

/** A selected card with the pieces the editor renders and the rules inspect. */
export type IDeckAdminSelectedCard = {
  cardId: string
  metadata: IDeckAdminCardMetadata | null
  quantity: number
  isLeader: boolean
  exceedsCopyLimit: boolean
}

export type IDeckAdminImportError = {
  /** 1-based line number, or 0 when the payload was empty. */
  line: number
  code: 'empty' | 'invalidLine' | 'nonPositiveQuantity'
  value?: string
}

export type IDeckAdminImportParseResult =
  | { isValid: true; cards: IDeckCardInput[] }
  | { isValid: false; error: IDeckAdminImportError }
