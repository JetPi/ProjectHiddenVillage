import type { IDeckCardInput } from '@/types/deck'

export type IDeckAdminDraft = {
  name: string
  quantitiesByCardId: ReadonlyMap<string, number>
}

export type IDeckAdminCardMetadata = {
  id: string
  displayName: string
  type: string
  color: string
  image: string
  imageVersion?: number | null
}

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
  messageKey: string
  params?: Record<string, string | number>
}

export type IDeckAdminValidationResult = {
  isValid: boolean
  violations: IDeckAdminViolation[]
}

export type IDeckAdminSelectedCard = {
  cardId: string
  metadata: IDeckAdminCardMetadata | null
  quantity: number
  isLeader: boolean
  exceedsCopyLimit: boolean
}

export type IDeckAdminImportError = {
  line: number
  code: 'empty' | 'invalidLine' | 'nonPositiveQuantity'
  value?: string
}

export type IDeckAdminImportParseResult =
  | { isValid: true; cards: IDeckCardInput[] }
  | { isValid: false; error: IDeckAdminImportError }
