import type { ICardCatalogEffectExecutionConditionArgumentKey } from './cardCatalogExecutionCondition'

export type IPagedResponse<TItem> = {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  items: TItem[]
}

export type ICardCatalogEffectExecutionConditionResponse = {
  argumentKey: ICardCatalogEffectExecutionConditionArgumentKey
  expectedValue: string
  ignoreCase: boolean
  negate: boolean
}

export type ICardCatalogPassiveReevaluationResponse = {
  triggerKinds: string[]
  scope: string
}

export type ICardCatalogPassiveConsequenceResponse = {
  consequenceEffectTypeKey: string
  targetPolicy: string
  consequenceArguments: Record<string, string>
}

export type ICardCatalogKeywordModificationResponse = {
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

export type ICardCatalogZoneCardPropertyPredicateResponse = {
  property: ICardCatalogPredicateProperty
  operator: string
  value: string | null
  values: string[]
  ignoreCase: boolean
}

export type ICardCatalogZoneCardRestrictionResponse = {
  predicates: ICardCatalogZoneCardPropertyPredicateResponse[]
  matchMode: string
}

export type ICardCatalogZoneAmountRequirementResponse = {
  amount: number
  comparison: string
  restriction: ICardCatalogZoneCardRestrictionResponse
}

export type ICardCatalogZoneRequirementSetResponse = {
  requirements: ICardCatalogZoneAmountRequirementResponse[]
  operator: string
  distinctCardsAcrossRequirements: boolean
}

export type ICardCatalogEffectContextConditionResponse = {
  inZone: string | null
  inZoneRequirements: ICardCatalogZoneRequirementSetResponse | null
}

export type ICardCatalogEffectContextRuleSetResponse = {
  player: ICardCatalogEffectContextConditionResponse | null
  opponent: ICardCatalogEffectContextConditionResponse | null
}

export type ICardCatalogAttributeModificationResponse = {
  targetType: string
  targetRange: string
  attribute: string
  operation: string
  value: number
  minimumValue: number | null
  maximumValue: number | null
}

export type ICardCatalogChakraAdjustmentResponse = {
  targetRange: string
  operation: string
  amount: number
}

export type ICardCatalogSummonCardFlipResponse = {
  targetRange: string
  faceState: string
}

export type ICardCatalogMoveCardActionResponse = {
  operation: string
  sourceZone: string | null
  destinationZone: string | null
  drawCount: number | null
  moveCount: number | null
  destinationIndex: number | null
  deckPlacement: string | null
  multiCardOrdering: string | null
  allowCrossPlayer: boolean
  destinationPlayerRange: string
}

export type ICardCatalogTributeTargetCompositionResponse = {
  exactTributeCount: number | null
  minimumTributeCount: number | null
  maximumTributeCount: number | null
  requireSingleSummonTarget: boolean
  requireDistinctSummonAndTributes: boolean
}

export type ICardCatalogEffectTargetLocationSelectorResponse = {
  kind: string
  supportSlotIndex: number | null
}

export type ICardCatalogEffectTargetRuleResponse = {
  scope: string
  inZone: string
  locationSelector: ICardCatalogEffectTargetLocationSelectorResponse
  tributeRole: string | null
  exactSelectedTargetCount: number | null
  minimumSelectedTargetCount: number | null
  maximumSelectedTargetCount: number | null
  restriction: ICardCatalogZoneCardRestrictionResponse
}

export type ICardCatalogEffectTargetRuleSetResponse = {
  operator: string
  exactTargetCount: number | null
  minimumTargetCount: number | null
  maximumTargetCount: number | null
  autoSelectAllValidTargets: boolean
  tributeComposition: ICardCatalogTributeTargetCompositionResponse | null
  rules: ICardCatalogEffectTargetRuleResponse[]
}

export type ICardCatalogEffectResponse = {
  id: string
  isSubordinate: boolean
  onSuccessEffectId: string | null
  onFailureEffectId: string | null
  runtimeEffectType: string
  effectType: string
  timing: string
  durationMode: string
  passiveMode: string
  passiveReevaluation: ICardCatalogPassiveReevaluationResponse | null
  passiveConsequences: ICardCatalogPassiveConsequenceResponse[]
  keywordModifications: ICardCatalogKeywordModificationResponse[]
  targetRange: string
  isOptional: boolean
  chakraCost: number | null
  globalRestrictions: string
  executionTargetSource: string
  executionFlowMode: string
  suppressSummonedTargetsEffectsWhileOnField: boolean
  revealTimingMode: string
  executionCondition: ICardCatalogEffectExecutionConditionResponse | null
  attributeModifications: ICardCatalogAttributeModificationResponse[]
  chakraAdjustments: ICardCatalogChakraAdjustmentResponse[]
  summonCardFlips: ICardCatalogSummonCardFlipResponse[]
  moveCardActions: ICardCatalogMoveCardActionResponse[]
  contextRules: ICardCatalogEffectContextRuleSetResponse[]
  targetRules: ICardCatalogEffectTargetRuleSetResponse
}

export type ICardCatalogItemResponse = {
  id: string
  image: string
  originalId: string
  mainAlternate: boolean
  attribute: string | null
  name: string[]
  displayName: string
  type: string
  traits: string[]
  color: string
  description: string
  damage: number
  power: number
  conditions: string[]
  effects: ICardCatalogEffectResponse[]
  life: number | null
  health: number | null
  cannotBeNormalSummoned: boolean
  supportName: string | null
  supportEffect: string | null
  supportCost: number | null
}
