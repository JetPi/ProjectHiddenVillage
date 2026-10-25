import type { IDeckCardMetadata, IDeckRulesetEvaluation } from '@/domain/deck/types'

export type IDeckAdminDraft = {
  name: string
  quantitiesByCardId: ReadonlyMap<string, number>
}

export type IDeckAdminCardMetadata = IDeckCardMetadata & {
  image: string
  imageVersion?: number | null
}

export type IDeckAdminNameViolationCode = 'nameRequired' | 'nameTooLong'

export type IDeckAdminNameViolation = {
  code: IDeckAdminNameViolationCode
  messageKey: string
  params?: Record<string, string | number>
}

export type IDeckAdminValidationResult = {
  nameViolations: IDeckAdminNameViolation[]
  evaluations: IDeckRulesetEvaluation[]
  isLegalInAnyRuleset: boolean
  isValid: boolean
}

export type IDeckAdminSelectedCard = {
  cardId: string
  metadata: IDeckAdminCardMetadata | null
  quantity: number
  isLeader: boolean
  exceedsCopyLimit: boolean
}
