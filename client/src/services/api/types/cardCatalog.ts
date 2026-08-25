import type { ICardCatalogEffectExecutionConditionArgumentKey } from '@/types/cardCatalogExecutionCondition'

export type ICardCatalogPageQuery = {
  page?: number
  pageSize?: number
  sort?: string
}

export type ICardCatalogEffectExecutionConditionRequest = {
  argumentKey: ICardCatalogEffectExecutionConditionArgumentKey
  expectedValue: string
  ignoreCase: boolean
  negate: boolean
}

export type ICardCatalogPassiveReevaluationRequest = {
  triggerKinds: string[]
  scope: string
}

export type ICardCatalogPassiveConsequenceRequest = {
  consequenceEffectTypeKey: string
  targetPolicy: string
  consequenceArguments?: Record<string, string>
}

export type ICardCatalogKeywordModificationRequest = {
  targetType: string
  operation: string
  keyword: string
}

export type ICardCatalogPredicateProperty =
  | 'Self'
  | 'Id'
  | 'Original Id'
  | 'Display Name'
  | 'Name'
  | 'Trait'
  | 'Type'
  | 'Color'
  | 'Power'
  | 'Damage'
  | 'Health'
  | 'Current Health'
  | 'Owner Player Id'
  | 'Controller Player Id'
  | 'Is Exhausted'
  | 'Is Rested'
  | 'Cannot Be Normal Summoned'

export type ICardCatalogZoneCardPropertyPredicateRequest = {
  property: ICardCatalogPredicateProperty
  operator: string
  value: string | null
  values: string[]
  ignoreCase: boolean
}

export type ICardCatalogZoneCardRestrictionRequest = {
  predicates: ICardCatalogZoneCardPropertyPredicateRequest[]
  matchMode: string
}

export type ICardCatalogZoneAmountRequirementRequest = {
  amount: number
  comparison: string
  restriction: ICardCatalogZoneCardRestrictionRequest
}

export type ICardCatalogZoneRequirementSetRequest = {
  requirements: ICardCatalogZoneAmountRequirementRequest[]
  operator: string
  distinctCardsAcrossRequirements: boolean
}

export type ICardCatalogEffectContextConditionRequest = {
  inZone: string | null
  inZoneRequirements: ICardCatalogZoneRequirementSetRequest | null
}

export type ICardCatalogEffectContextRuleSetRequest = {
  player: ICardCatalogEffectContextConditionRequest | null
  opponent: ICardCatalogEffectContextConditionRequest | null
}

export type ICardCatalogAttributeModificationRequest = {
  targetType: string
  targetRange: string
  attribute: string
  operation: string
  value: number
  minimumValue: number | null
  maximumValue: number | null
}

export type ICardCatalogChakraAdjustmentRequest = {
  targetRange: string
  operation: string
  amount: number
}

export type ICardCatalogSummonCardFlipRequest = {
  targetRange: string
  faceState: string
}

export type ICardCatalogMoveCardActionRequest = {
  operation: string
  sourceZone: string | null
  destinationZone: string | null
  drawCount: number | null
  destinationIndex: number | null
  allowCrossPlayer: boolean
  destinationPlayerRange: string
}

export type ICardCatalogTributeTargetCompositionRequest = {
  exactTributeCount: number | null
  minimumTributeCount: number | null
  maximumTributeCount: number | null
  requireSingleSummonTarget: boolean
  requireDistinctSummonAndTributes: boolean
}

export type ICardCatalogEffectTargetRuleRequest = {
  scope: string
  inZone: string
  tributeRole: string | null
  exactSelectedTargetCount: number | null
  minimumSelectedTargetCount: number | null
  maximumSelectedTargetCount: number | null
  restriction: ICardCatalogZoneCardRestrictionRequest
}

export type ICardCatalogEffectTargetRuleSetRequest = {
  operator: string
  exactTargetCount: number | null
  minimumTargetCount: number | null
  maximumTargetCount: number | null
  autoSelectAllValidTargets: boolean
  tributeComposition: ICardCatalogTributeTargetCompositionRequest | null
  rules: ICardCatalogEffectTargetRuleRequest[]
}

export type ICardCatalogEffectRequest = {
  id: string
  runtimeEffectType: string
  effectType: string
  timing: string
  durationMode: string
  passiveMode: string
  passiveReevaluation: ICardCatalogPassiveReevaluationRequest | null
  passiveConsequences: ICardCatalogPassiveConsequenceRequest[]
  keywordModifications: ICardCatalogKeywordModificationRequest[]
  targetRange: string
  isOptional: boolean
  chakraCost: number | null
  globalRestrictions: string
  executionTargetSource: string
  executionFlowMode: string
  suppressSummonedTargetsEffectsWhileOnField: boolean
  executionCondition: ICardCatalogEffectExecutionConditionRequest | null
  attributeModifications: ICardCatalogAttributeModificationRequest[]
  chakraAdjustments: ICardCatalogChakraAdjustmentRequest[]
  summonCardFlips: ICardCatalogSummonCardFlipRequest[]
  moveCardActions: ICardCatalogMoveCardActionRequest[]
  contextRules: ICardCatalogEffectContextRuleSetRequest[]
  targetRules: ICardCatalogEffectTargetRuleSetRequest
}

export type IUpdateCardCatalogEffectsRequest = {
  conditions?: string[]
  effects?: ICardCatalogEffectRequest[]
  description?: string
  supportEffect?: string
  cannotBeNormalSummoned?: boolean
  type?: string
  color?: string
  power?: number
  damage?: number
  life?: number
  health?: number
}
