import i18n from '@/i18n'
import type { ICardCatalogEffectRequest } from '@/services/api/types/cardCatalog'
import {
  EMPTY_DRAFT,
  normalizeEffectForEditor,
  parseEditorPayload,
} from '@/views/admin/model/cardAdminEffectPayload'
import { createDefaultEffect } from '@/views/admin/utils/cardAdminDetailDefaultBuilders'

/** Envelope marker so a pasted blob from another feature is rejected with a clear message. */
export const CARD_EFFECTS_EXPORT_KIND = 'phv.card-effects'

/** Bump only when the payload shape changes incompatibly; newer payloads are refused. */
export const CARD_EFFECTS_EXPORT_VERSION = 1

export type ICardEffectsTransferSource = {
  id: string | null
  displayName: string | null
}

export type ICardEffectsImportSuccess = {
  ok: true
  conditions: string[]
  effects: ICardCatalogEffectRequest[]
  sourceCard: ICardEffectsTransferSource | null
}

export type ICardEffectsImportFailure = {
  ok: false
  message: string
}

export type ICardEffectsImportResult = ICardEffectsImportSuccess | ICardEffectsImportFailure

type IJsonRecord = Record<string, unknown>

/**
 * Fields whose default is `null` still need a concrete wire type when present, otherwise a hand-edited
 * payload could swap an object for a string and crash a panel after import.
 */
const NULLABLE_EFFECT_FIELD_TYPES: Record<string, 'string' | 'number' | 'object'> = {
  onSuccessEffectId: 'string',
  onFailureEffectId: 'string',
  chakraCost: 'number',
  passiveReevaluation: 'object',
  revealPostConditionRuleSet: 'object',
  revealPostConditionRestriction: 'object',
  revealPostConditionPredicate: 'object',
  executionCondition: 'object',
}

/** Optional effect fields that are not part of `createDefaultEffect()`, so they need explicit handling. */
const OPTIONAL_EFFECT_FIELD_TYPES: Record<string, 'string' | 'stringOrNull'> = {
  targetSlotName: 'stringOrNull',
  chainTargetSlotName: 'stringOrNull',
}

const EFFECT_LIST_FIELDS: Array<keyof ICardCatalogEffectRequest> = [
  'passiveConsequences',
  'keywordModifications',
  'attributeModifications',
  'chakraAdjustments',
  'summonCardFlips',
  'faceStateLocks',
  'moveCardActions',
  'contextRules',
]

class EffectFieldError extends Error {
  readonly path: string
  readonly expected: string

  constructor(path: string, expected: string) {
    super(`${path} must be ${expected}`)
    this.path = path
    this.expected = expected
  }
}

function isJsonRecord(value: unknown): value is IJsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(message: string): ICardEffectsImportFailure {
  return { ok: false, message }
}

export function buildEffectsExport(input: {
  conditions: string[]
  effects: ICardCatalogEffectRequest[]
  source: { cardId?: string | null; displayName?: string | null }
}): string {
  return JSON.stringify(
    {
      kind: CARD_EFFECTS_EXPORT_KIND,
      version: CARD_EFFECTS_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      sourceCard: {
        id: input.source.cardId?.trim() || null,
        displayName: input.source.displayName?.trim() || null,
      },
      conditions: input.conditions.map((condition) => condition.trim()).filter((condition) => condition.length > 0),
      effects: input.effects,
    },
    null,
    2,
  )
}

function readSourceCard(raw: unknown): ICardEffectsTransferSource | null {
  if (!isJsonRecord(raw)) {
    return null
  }

  const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim() : null
  const displayName = typeof raw.displayName === 'string' && raw.displayName.trim().length > 0
    ? raw.displayName.trim()
    : null

  return id || displayName ? { id, displayName } : null
}

function assertFieldType(key: string, rawValue: unknown, defaultValue: unknown): void {
  if (defaultValue === null) {
    if (rawValue === null) {
      return
    }

    const expected = NULLABLE_EFFECT_FIELD_TYPES[key]
    if (!expected) {
      return
    }

    const matches = expected === 'object'
      ? isJsonRecord(rawValue)
      : typeof rawValue === expected

    if (!matches) {
      throw new EffectFieldError(key, expected)
    }

    return
  }

  if (Array.isArray(defaultValue)) {
    if (!Array.isArray(rawValue)) {
      throw new EffectFieldError(key, 'an array')
    }

    return
  }

  switch (typeof defaultValue) {
    case 'string':
      if (typeof rawValue !== 'string') {
        throw new EffectFieldError(key, 'a string')
      }
      return
    case 'number':
      if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
        throw new EffectFieldError(key, 'a number')
      }
      return
    case 'boolean':
      if (typeof rawValue !== 'boolean') {
        throw new EffectFieldError(key, 'a boolean')
      }
      return
    case 'object':
      if (!isJsonRecord(rawValue)) {
        throw new EffectFieldError(key, 'an object')
      }
      return
    default:
      return
  }
}

/**
 * Starts from the current defaults and overlays only the keys this client knows about: an export from a
 * client that predates a field still imports, and unknown keys never reach the editor draft or the PATCH.
 */
function mergeEffectWithDefaults(raw: IJsonRecord): ICardCatalogEffectRequest {
  const defaults = createDefaultEffect()
  const merged: IJsonRecord = { ...defaults }

  for (const key of Object.keys(defaults)) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) {
      continue
    }

    const rawValue = raw[key]
    assertFieldType(key, rawValue, (defaults as unknown as IJsonRecord)[key])
    merged[key] = rawValue
  }

  for (const [key, expected] of Object.entries(OPTIONAL_EFFECT_FIELD_TYPES)) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) {
      continue
    }

    const rawValue = raw[key]
    const matches = expected === 'stringOrNull'
      ? rawValue === null || typeof rawValue === 'string'
      : typeof rawValue === 'string'

    if (!matches) {
      throw new EffectFieldError(key, expected === 'stringOrNull' ? 'a string or null' : 'a string')
    }

    merged[key] = rawValue
  }

  return merged as unknown as ICardCatalogEffectRequest
}

function findRestrictionIssue(restriction: unknown, path: string): string | null {
  if (!isJsonRecord(restriction)) {
    return `${path} must be an object`
  }

  if (!Array.isArray(restriction.predicates)) {
    return `${path}.predicates must be an array`
  }

  return null
}

function findRuleSetIssue(ruleSet: unknown, path: string): string | null {
  if (!isJsonRecord(ruleSet)) {
    return `${path} must be an object`
  }

  if (!Array.isArray(ruleSet.restrictions)) {
    return `${path}.restrictions must be an array`
  }

  return null
}

/**
 * Guards the containers the effect panels dereference. Validation alone would not catch these, because a
 * structurally broken nested object still passes the required-field checks.
 */
function findEffectShapeIssue(effect: ICardCatalogEffectRequest): string | null {
  for (const field of EFFECT_LIST_FIELDS) {
    const list = effect[field] as unknown
    if (!Array.isArray(list)) {
      return `${String(field)} must be an array`
    }

    const brokenIndex = list.findIndex((entry) => !isJsonRecord(entry))
    if (brokenIndex >= 0) {
      return `${String(field)}[${brokenIndex}] must be an object`
    }
  }

  const targetRules = effect.targetRules as unknown
  if (!isJsonRecord(targetRules)) {
    return 'targetRules must be an object'
  }

  if (!Array.isArray(targetRules.rules)) {
    return 'targetRules.rules must be an array'
  }

  for (const [index, rule] of targetRules.rules.entries()) {
    if (!isJsonRecord(rule)) {
      return `targetRules.rules[${index}] must be an object`
    }

    const restrictionIssue = findRestrictionIssue(rule.restriction, `targetRules.rules[${index}].restriction`)
    if (restrictionIssue) {
      return restrictionIssue
    }

    if (!isJsonRecord(rule.locationSelector)) {
      return `targetRules.rules[${index}].locationSelector must be an object`
    }
  }

  if (targetRules.tributeComposition !== null && !isJsonRecord(targetRules.tributeComposition)) {
    return 'targetRules.tributeComposition must be an object or null'
  }

  for (const [index, contextRule] of effect.contextRules.entries()) {
    if (!isJsonRecord(contextRule)) {
      return `contextRules[${index}] must be an object`
    }

    for (const audience of ['player', 'opponent'] as const) {
      const condition = contextRule[audience]
      if (condition === null) {
        continue
      }

      if (!isJsonRecord(condition)) {
        return `contextRules[${index}].${audience} must be an object or null`
      }

      const requirementSet = condition.inZoneRequirements
      if (requirementSet === null) {
        continue
      }

      if (!isJsonRecord(requirementSet) || !Array.isArray(requirementSet.requirements)) {
        return `contextRules[${index}].${audience}.inZoneRequirements.requirements must be an array`
      }
    }
  }

  if (effect.passiveReevaluation !== null) {
    if (!isJsonRecord(effect.passiveReevaluation)) {
      return 'passiveReevaluation must be an object or null'
    }

    if (!Array.isArray(effect.passiveReevaluation.triggerKinds)) {
      return 'passiveReevaluation.triggerKinds must be an array'
    }
  }

  if (effect.revealPostConditionRuleSet !== null) {
    const ruleSetIssue = findRuleSetIssue(effect.revealPostConditionRuleSet, 'revealPostConditionRuleSet')
    if (ruleSetIssue) {
      return ruleSetIssue
    }
  }

  if (effect.revealPostConditionRestriction !== null) {
    const restrictionIssue = findRestrictionIssue(effect.revealPostConditionRestriction, 'revealPostConditionRestriction')
    if (restrictionIssue) {
      return restrictionIssue
    }
  }

  if (effect.executionCondition !== null && !isJsonRecord(effect.executionCondition)) {
    return 'executionCondition must be an object or null'
  }

  return null
}

function readConditions(raw: unknown, failShape: () => ICardEffectsImportFailure): string[] | ICardEffectsImportFailure {
  if (raw === undefined || raw === null) {
    return []
  }

  if (!Array.isArray(raw)) {
    return failShape()
  }

  const conditions: string[] = []

  for (const entry of raw) {
    if (typeof entry !== 'string') {
      return failShape()
    }

    const normalized = entry.trim()
    if (normalized.length > 0 && !conditions.includes(normalized)) {
      conditions.push(normalized)
    }
  }

  return conditions
}

function shapeFailure(): ICardEffectsImportFailure {
  return fail(i18n.t('admin.transfer.errors.shape'))
}

function effectShapeMessage(index: number, id: string, path: string): string {
  return id.trim().length > 0
    ? i18n.t('admin.transfer.errors.effectShapeWithId', { index: index + 1, id, path })
    : i18n.t('admin.transfer.errors.effectShape', { index: index + 1, path })
}

export function parseEffectsImportPayload(rawPayload: string): ICardEffectsImportResult {
  const trimmed = rawPayload.trim()

  if (trimmed.length === 0) {
    return fail(i18n.t('admin.transfer.errors.empty'))
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return fail(i18n.t('admin.transfer.errors.invalidJson'))
  }

  let rawEffects: unknown
  let rawConditions: unknown
  let rawSourceCard: unknown
  let version: number | null = null

  if (Array.isArray(parsed)) {
    rawEffects = parsed
  } else if (isJsonRecord(parsed)) {
    if ('kind' in parsed && parsed.kind !== CARD_EFFECTS_EXPORT_KIND) {
      return fail(i18n.t('admin.transfer.errors.kind'))
    }

    if ('version' in parsed && parsed.version !== undefined) {
      if (typeof parsed.version !== 'number' || !Number.isFinite(parsed.version)) {
        return shapeFailure()
      }

      version = parsed.version
    }

    rawEffects = parsed.effects
    rawConditions = parsed.conditions
    rawSourceCard = parsed.sourceCard
  } else {
    return shapeFailure()
  }

  if (version !== null && version > CARD_EFFECTS_EXPORT_VERSION) {
    return fail(i18n.t('admin.transfer.errors.newerVersion'))
  }

  if (!Array.isArray(rawEffects)) {
    return shapeFailure()
  }

  const conditions = readConditions(rawConditions, shapeFailure)
  if (!Array.isArray(conditions)) {
    return conditions
  }

  const effects: ICardCatalogEffectRequest[] = []

  for (const [index, candidate] of rawEffects.entries()) {
    if (!isJsonRecord(candidate)) {
      return fail(effectShapeMessage(index, '', 'the effect entry'))
    }

    let merged: ICardCatalogEffectRequest

    try {
      merged = mergeEffectWithDefaults(candidate)
    } catch (error) {
      const path = error instanceof EffectFieldError ? error.message : 'the effect entry'
      return fail(effectShapeMessage(
        index,
        typeof candidate.id === 'string' ? candidate.id : '',
        path,
      ))
    }

    const shapeIssue = findEffectShapeIssue(merged)
    if (shapeIssue) {
      return fail(effectShapeMessage(index, merged.id, shapeIssue))
    }

    effects.push(normalizeEffectForEditor(merged))
  }

  if (effects.length === 0 && conditions.length === 0) {
    return fail(i18n.t('admin.transfer.errors.noContent'))
  }

  const validation = parseEditorPayload({
    ...EMPTY_DRAFT,
    conditions,
    effects,
  })

  if (!validation.payload) {
    const branchMessages = Object.keys(validation.errors.effectBranches)
      .sort((left, right) => Number(left) - Number(right))
      .flatMap((key) => validation.errors.effectBranches[Number(key)] ?? [])

    const messages = [
      validation.errors.conditions,
      validation.errors.effects,
      ...branchMessages,
    ].filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)

    return fail(messages.length > 0
      ? messages.join(' ')
      : i18n.t('admin.transfer.errors.validation'))
  }

  return {
    ok: true,
    conditions: validation.payload.conditions,
    effects,
    sourceCard: readSourceCard(rawSourceCard),
  }
}
