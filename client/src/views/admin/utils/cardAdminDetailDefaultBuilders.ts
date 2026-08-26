import type {
  ICardCatalogAttributeModificationRequest,
  ICardCatalogChakraAdjustmentRequest,
  ICardCatalogEffectContextRuleSetRequest,
  ICardCatalogEffectRequest,
  ICardCatalogEffectTargetRuleRequest,
  ICardCatalogFaceStateLockRequest,
  ICardCatalogKeywordModificationRequest,
  ICardCatalogMoveCardActionRequest,
  ICardCatalogPassiveConsequenceRequest,
  ICardCatalogPassiveReevaluationRequest,
  ICardCatalogSummonCardFlipRequest,
  ICardCatalogZoneCardPropertyPredicateRequest,
  ICardCatalogZoneCardRestrictionRequest,
} from '@/services/api/types/cardCatalog'

export function createDefaultEffect(): ICardCatalogEffectRequest {
  return {
    id: 'new-effect',
    isSubordinate: false,
    onSuccessEffectId: null,
    onFailureEffectId: null,
    runtimeEffectType: 'Change Values',
    effectType: 'Support',
    timing: 'Quick',
    durationMode: 'Instant',
    passiveMode: 'None',
    passiveReevaluation: null,
    passiveConsequences: [],
    keywordModifications: [],
    targetRange: 'Self',
    isOptional: false,
    chakraCost: null,
    globalRestrictions: 'None',
    executionTargetSource: 'Selected Targets',
    executionFlowMode: 'Per Step',
    suppressSummonedTargetsEffectsWhileOnField: false,
    revealTimingMode: 'Reveal Last',
    revealPostConditionRuleSet: null,
    revealPostConditionRestriction: null,
    revealPostConditionPredicate: null,
    executionCondition: null,
    attributeModifications: [],
    chakraAdjustments: [],
    summonCardFlips: [],
    faceStateLocks: [],
    moveCardActions: [],
    contextRules: [],
    targetRules: {
      operator: 'Any',
      exactTargetCount: null,
      minimumTargetCount: null,
      maximumTargetCount: null,
      autoSelectAllValidTargets: false,
      tributeComposition: null,
      rules: [],
    },
  }
}

export function createDefaultPassiveReevaluation(): ICardCatalogPassiveReevaluationRequest {
  return {
    triggerKinds: ['Any'],
    scope: 'Source Card Only',
  }
}

export function createDefaultPassiveConsequence(): ICardCatalogPassiveConsequenceRequest {
  return {
    consequenceEffectTypeKey: 'GainKeyword',
    targetPolicy: 'Source Card',
  }
}

export function createDefaultKeywordModification(): ICardCatalogKeywordModificationRequest {
  return {
    targetType: 'Source Card',
    operation: 'Add',
    keyword: '',
  }
}

export function createDefaultPredicate(): ICardCatalogZoneCardPropertyPredicateRequest {
  return {
    property: 'Type',
    operator: 'Equals',
    value: '',
    values: [],
    ignoreCase: true,
  }
}

export function createDefaultRestriction(): ICardCatalogZoneCardRestrictionRequest {
  return {
    predicates: [],
    matchMode: 'Any',
  }
}

export function createDefaultZoneAmountRequirement() {
  return {
    amount: 1,
    comparison: 'Exact',
    restriction: createDefaultRestriction(),
  }
}

export function createDefaultZoneRequirementSet() {
  return {
    requirements: [createDefaultZoneAmountRequirement()],
    operator: 'All',
    distinctCardsAcrossRequirements: false,
  }
}

export function createDefaultTargetRule(): ICardCatalogEffectTargetRuleRequest {
  return {
    scope: 'Self',
    inZone: 'Character Field',
    locationSelector: {
      kind: 'Any',
      supportSlotIndex: null,
    },
    tributeRole: null,
    exactSelectedTargetCount: null,
    minimumSelectedTargetCount: null,
    maximumSelectedTargetCount: null,
    restriction: createDefaultRestriction(),
  }
}

export function createDefaultContextRule(): ICardCatalogEffectContextRuleSetRequest {
  return {
    player: {
      inZone: 'Character Field',
      inZoneRequirements: null,
    },
    opponent: null,
  }
}

export function createDefaultAttributeModification(): ICardCatalogAttributeModificationRequest {
  return {
    targetType: 'Selected Targets',
    targetRange: 'Self',
    attribute: 'Card Power',
    operation: 'Add',
    value: 1,
    minimumValue: null,
    maximumValue: null,
  }
}

export function createDefaultChakraAdjustment(): ICardCatalogChakraAdjustmentRequest {
  return {
    targetRange: 'Self',
    operation: 'Pay',
    amount: 1,
  }
}

export function createDefaultSummonCardFlip(): ICardCatalogSummonCardFlipRequest {
  return {
    targetCategory: 'Chakra Card',
    targetRange: 'Self',
    faceState: 'Face Up',
  }
}

export function createDefaultMoveCardAction(): ICardCatalogMoveCardActionRequest {
  return {
    operation: 'Move',
    sourceZone: 'Hand',
    destinationZone: 'Deck',
    drawCount: null,
    moveCount: 1,
    destinationIndex: 0,
    deckPlacement: 'Top',
    multiCardOrdering: 'Selected Order',
    allowCrossPlayer: false,
    destinationPlayerRange: 'Self',
  }
}

export function createDefaultFaceStateLock(): ICardCatalogFaceStateLockRequest {
  return {
    targetCategory: 'Chakra Card',
    operation: 'Cannot Turn Face Up',
    targetRange: 'Self',
  }
}
