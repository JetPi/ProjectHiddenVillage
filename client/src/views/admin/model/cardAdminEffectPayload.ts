import axios from 'axios'
import i18n, { translateKey } from '@/i18n'
import type {
  ICardAdminEffectEditorDraft,
  ICardAdminEffectEditorHydrationSource,
  ICardAdminEffectEditorValidationErrors,
  IParsedCardAdminEffectsPayload,
} from '@/views/admin/types/cardAdminDetailTypes'
import type { ICardCatalogEffectRequest } from '@/services/api/types/cardCatalog'

/**
 * The payload rules for the card effects editor: how a card hydrates the draft, what a draft must satisfy before
 * it may be sent, and how a failed request reads back to the author. Kept apart from the editing state so the
 * update screen and the create screen enforce exactly the same rules.
 */

export const EMPTY_VALIDATION_ERRORS: ICardAdminEffectEditorValidationErrors = {
  form: null,
  conditions: null,
  effects: null,
  effectBranches: {},
}

export const EMPTY_DRAFT: ICardAdminEffectEditorDraft = {
  type: 'Character',
  color: 'N/A',
  power: 0,
  damage: 0,
  life: null,
  health: 0,
  description: '',
  supportEffect: '',
  cannotBeNormalSummoned: false,
  conditions: [],
  effects: [],
}

export function isLeaderType(cardType: string): boolean {
  return cardType.trim().toLowerCase() === 'leader'
}

export function toEditorDraft(card: ICardAdminEffectEditorHydrationSource | null): ICardAdminEffectEditorDraft {
  if (!card) {
    return EMPTY_DRAFT
  }

  return {
    type: card.type,
    color: card.color,
    power: card.power,
    damage: card.damage,
    life: card.life,
    health: card.health,
    description: card.description,
    supportEffect: card.supportEffect ?? '',
    cannotBeNormalSummoned: card.cannotBeNormalSummoned,
    conditions: [...card.conditions],
    effects: card.effects.map((effect) => ({
      ...effect,
      revealPostConditionRuleSet: effect.revealPostConditionRuleSet ?? (effect.revealPostConditionRestriction
        ? {
          operator: 'All',
          restrictions: [effect.revealPostConditionRestriction],
        }
        : effect.revealPostConditionPredicate
          ? {
            operator: 'All',
            restrictions: [
              {
                predicates: [effect.revealPostConditionPredicate],
                matchMode: 'All',
              },
            ],
          }
          : null),
      revealPostConditionRestriction: effect.revealPostConditionRestriction ?? (effect.revealPostConditionPredicate
        ? {
          predicates: [effect.revealPostConditionPredicate],
          matchMode: 'All',
        }
        : null),
      revealPostConditionPredicate: effect.revealPostConditionPredicate ?? null,
    })),
  }
}

export function normalizeEffectForSave(effect: ICardCatalogEffectRequest): ICardCatalogEffectRequest {
  const normalizedOnSuccess = effect.onSuccessEffectId?.trim() ?? ''
  const normalizedOnFailure = effect.onFailureEffectId?.trim() ?? ''

  return {
    ...effect,
    onSuccessEffectId: normalizedOnSuccess.length > 0 ? normalizedOnSuccess : null,
    onFailureEffectId: normalizedOnFailure.length > 0 ? normalizedOnFailure : null,
    revealPostConditionRuleSet: effect.revealPostConditionRuleSet ?? (effect.revealPostConditionRestriction
      ? {
        operator: 'All',
        restrictions: [effect.revealPostConditionRestriction],
      }
      : effect.revealPostConditionPredicate
        ? {
          operator: 'All',
          restrictions: [
            {
              predicates: [effect.revealPostConditionPredicate],
              matchMode: 'All',
            },
          ],
        }
        : null),
    revealPostConditionRestriction: effect.revealPostConditionRestriction ?? (effect.revealPostConditionPredicate
      ? {
        predicates: [effect.revealPostConditionPredicate],
        matchMode: 'All',
      }
      : null),
    revealPostConditionPredicate: null,
    passiveConsequences: (effect.passiveConsequences ?? []).map((consequence) => ({
      consequenceEffectTypeKey: consequence.consequenceEffectTypeKey,
      targetPolicy: consequence.targetPolicy,
    })),
  }
}

export function parseEditorPayload(draft: ICardAdminEffectEditorDraft): {
  payload: IParsedCardAdminEffectsPayload | null
  errors: ICardAdminEffectEditorValidationErrors
} {
  const nextErrors: ICardAdminEffectEditorValidationErrors = {
    ...EMPTY_VALIDATION_ERRORS,
  }

  if (!Array.isArray(draft.conditions) || !draft.conditions.every((entry) => typeof entry === 'string')) {
    nextErrors.conditions = i18n.t('admin.validation.conditionsMustBeList')
  }

  if (!Array.isArray(draft.effects)) {
    nextErrors.effects = i18n.t('admin.validation.effectsMustBeList')
  } else if (!draft.effects.every((effect) =>
    effect.id.trim().length > 0
    && effect.effectType.trim().length > 0
    && effect.timing.trim().length > 0
    && effect.durationMode.trim().length > 0
    && Array.isArray(effect.contextRules)
    && !!effect.targetRules)) {
    nextErrors.effects = i18n.t('admin.validation.effectFieldsRequired')
  } else {
    const normalizedIds = draft.effects.map((effect) => effect.id.trim())
    const validIds = new Set(
      normalizedIds
        .filter((value) => value.length > 0),
    )

    const duplicateIds = new Set<string>()
    const seenIds = new Set<string>()
    normalizedIds.forEach((id) => {
      if (!id) {
        return
      }

      if (seenIds.has(id)) {
        duplicateIds.add(id)
        return
      }

      seenIds.add(id)
    })

    const effectBranchErrors: Record<number, string[]> = {}
    draft.effects.forEach((effect, index) => {
      const effectErrors: string[] = []
      const effectId = effect.id.trim()

      if (effectId && duplicateIds.has(effectId)) {
        effectErrors.push(i18n.t('admin.validation.effectIdUnique', { id: effectId }))
      }

      const branchTargets = [
        { labelKey: 'admin.detail.sections.onSuccess', target: effect.onSuccessEffectId },
        { labelKey: 'admin.detail.sections.onFailure', target: effect.onFailureEffectId },
      ]

      branchTargets.forEach(({ labelKey, target }) => {
        const normalizedTarget = target?.trim() ?? ''
        if (!normalizedTarget) {
          return
        }

        const label = translateKey(i18n.t, labelKey)

        if (!validIds.has(normalizedTarget)) {
          effectErrors.push(i18n.t('admin.validation.branchTargetMissing', { label, target: normalizedTarget }))
          return
        }

        if (effectId && normalizedTarget === effectId) {
          effectErrors.push(i18n.t('admin.validation.branchTargetSelf', { label, id: effectId }))
        }
      })

      if (effectErrors.length > 0) {
        effectBranchErrors[index] = effectErrors
      }
    })

    if (Object.keys(effectBranchErrors).length > 0) {
      nextErrors.effects = i18n.t('admin.validation.fixBranchErrors')
      nextErrors.effectBranches = effectBranchErrors
    }
  }

  if (nextErrors.conditions || nextErrors.effects) {
    return {
      payload: null,
      errors: nextErrors,
    }
  }

  const normalizedConditions = draft.conditions
    .map((entry) => entry.trim())
    .filter((entry, index, all) => entry.length > 0 && all.indexOf(entry) === index)
  const normalizedEffects = draft.effects
    .map(normalizeEffectForSave)

  return {
    payload: {
      conditions: normalizedConditions,
      effects: normalizedEffects,
    },
    errors: nextErrors,
  }
}

/**
 * Turns a failed card admin request into something worth showing: the API's validation problem body when there
 * is one, and the call's own message otherwise.
 */
export function getCardAdminRequestErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return i18n.t('admin.validation.saveEffectFailed')
  }

  const payload = error.response?.data

  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const detail = 'detail' in payload && typeof payload.detail === 'string'
      ? payload.detail.trim()
      : ''
    const title = 'title' in payload && typeof payload.title === 'string'
      ? payload.title.trim()
      : ''

    const toFriendlyPath = (path: string): string => {
      return path
        .replace(/\[(\d+)\]/g, ' $1')
        .replace(/\./g, ' > ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\s+/g, ' ')
        .trim()
    }

    const errors = 'errors' in payload && payload.errors && typeof payload.errors === 'object'
      ? Object.entries(payload.errors as Record<string, unknown>)
      : []

    const validationLines = errors.flatMap(([path, messages]) => {
      if (!Array.isArray(messages)) {
        return []
      }

      return messages
        .filter((message): message is string => typeof message === 'string' && message.trim().length > 0)
        .map((message) => `- ${toFriendlyPath(path)}: ${message.trim()}`)
    })

    if (validationLines.length > 0) {
      const lines = [title || i18n.t('admin.validation.validationFailed'), '']
      lines.push(...validationLines)

      return lines.join('\n')
    }

    if (detail.length > 0) {
      return detail
    }

    if (title.length > 0) {
      return title
    }
  }

  return error.message || i18n.t('admin.validation.saveEffectFailed')
}
