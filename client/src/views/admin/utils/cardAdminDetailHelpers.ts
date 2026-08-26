import { PLAYER_ZONE_OPTIONS, REVEAL_ZONE_OPTIONS } from '@/views/admin/constants'
import type { ICountConstraintMode } from '@/views/admin/types/countConstraintField'
import type {
  ICardCatalogEffectRequest,
  ICardCatalogZoneCardPropertyPredicateRequest,
  ICardCatalogZoneCardRestrictionRuleSetRequest,
} from '@/services/api/types/cardCatalog'

export function parseNullableInteger(value: string): number | null {
  const nextValue = value.trim()
  if (!nextValue) {
    return null
  }

  const parsed = Number.parseInt(nextValue, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function getPredicateEntries(predicate: ICardCatalogZoneCardPropertyPredicateRequest): string[] {
  const normalizedSingleValue = predicate.value?.trim()
  const normalizedArrayValues = predicate.values
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  if (normalizedArrayValues.length > 0 && normalizedSingleValue) {
    return [normalizedSingleValue, ...normalizedArrayValues]
  }

  if (normalizedArrayValues.length > 0) {
    return normalizedArrayValues
  }

  return normalizedSingleValue ? [normalizedSingleValue] : []
}

export function appendPredicateEntries(
  predicate: ICardCatalogZoneCardPropertyPredicateRequest,
  rawInput: string,
): ICardCatalogZoneCardPropertyPredicateRequest {
  const nextEntries = rawInput
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)

  if (nextEntries.length === 0) {
    return predicate
  }

  const mergedEntries = [...getPredicateEntries(predicate), ...nextEntries]

  if (mergedEntries.length === 1) {
    return {
      ...predicate,
      value: mergedEntries[0],
      values: [],
    }
  }

  return {
    ...predicate,
    value: null,
    values: mergedEntries,
  }
}

export function removePredicateEntryAt(
  predicate: ICardCatalogZoneCardPropertyPredicateRequest,
  entryIndex: number,
): ICardCatalogZoneCardPropertyPredicateRequest {
  const remainingEntries = getPredicateEntries(predicate).filter((_, index) => index !== entryIndex)

  if (remainingEntries.length === 0) {
    return {
      ...predicate,
      value: null,
      values: [],
    }
  }

  if (remainingEntries.length === 1) {
    return {
      ...predicate,
      value: remainingEntries[0],
      values: [],
    }
  }

  return {
    ...predicate,
    value: null,
    values: remainingEntries,
  }
}

export function resolveRevealPostConditionRuleSet(
  effect: ICardCatalogEffectRequest,
): ICardCatalogZoneCardRestrictionRuleSetRequest | null {
  if (effect.revealPostConditionRuleSet) {
    return effect.revealPostConditionRuleSet
  }

  if (effect.revealPostConditionRestriction) {
    return {
      operator: 'All',
      restrictions: [effect.revealPostConditionRestriction],
    }
  }

  if (!effect.revealPostConditionPredicate) {
    return null
  }

  return {
    operator: 'All',
    restrictions: [
      {
        matchMode: 'All',
        predicates: [effect.revealPostConditionPredicate],
      },
    ],
  }
}

export function resolveCountConstraintMode(
  exactCount: number | null,
  minimumCount: number | null,
  maximumCount: number | null,
  autoSelectAllValidTargets = false,
): ICountConstraintMode {
  if (autoSelectAllValidTargets) {
    return 'All'
  }

  if (exactCount !== null) {
    return 'Exact'
  }

  if (minimumCount !== null) {
    return 'Minimum'
  }

  if (maximumCount !== null) {
    return 'Maximum'
  }

  return 'Exact'
}

export function resolveCountConstraintValue(
  mode: ICountConstraintMode,
  exactCount: number | null,
  minimumCount: number | null,
  maximumCount: number | null,
): number | null {
  if (mode === 'All') {
    return null
  }

  if (mode === 'Exact') {
    return exactCount
  }

  if (mode === 'Minimum') {
    return minimumCount
  }

  return maximumCount
}

export function resolveCountConstraintSeedValue(
  exactCount: number | null,
  minimumCount: number | null,
  maximumCount: number | null,
  autoSelectAllValidTargets = false,
): number {
  const currentMode = resolveCountConstraintMode(
    exactCount,
    minimumCount,
    maximumCount,
    autoSelectAllValidTargets,
  )

  const currentValue = resolveCountConstraintValue(
    currentMode,
    exactCount,
    minimumCount,
    maximumCount,
  )

  return currentValue ?? 1
}

export function resolveAttributeValueConstraintMode(
  minimumValue: number | null,
  maximumValue: number | null,
): ICountConstraintMode {
  if (minimumValue !== null) {
    return 'Minimum'
  }

  if (maximumValue !== null) {
    return 'Maximum'
  }

  return 'Exact'
}

export function isSummonOrTributeRuntimeEffect(runtimeEffectType: string): boolean {
  return runtimeEffectType === 'Tribute' || runtimeEffectType.startsWith('Summon')
}

export function isAttackNegationRuntimeEffect(runtimeEffectType: string): boolean {
  return runtimeEffectType === 'Interrupt Attack'
}

export function resolveTargetZoneOptions(runtimeEffectType: string): readonly string[] {
  if (runtimeEffectType === 'Reveal Card') {
    return REVEAL_ZONE_OPTIONS
  }

  return PLAYER_ZONE_OPTIONS
}

export function normalizeRevealRuleZone(zone: string): string {
  return REVEAL_ZONE_OPTIONS.includes(zone as (typeof REVEAL_ZONE_OPTIONS)[number])
    ? zone
    : 'Hand'
}

export function normalizeEffectId(value: string | null | undefined): string {
  return value?.trim() ?? ''
}
