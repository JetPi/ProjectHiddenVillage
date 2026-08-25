import { useCallback, useMemo, useState } from 'react'
import axios from 'axios'
import { useUpdateCardCatalogEffectsMutation } from '@/services/queries/cardQueries'
import type {
  ICardAdminEffectEditorDraft,
  ICardAdminEffectEditorHydrationSource,
  ICardAdminEffectEditorModel,
  ICardAdminEffectEditorSaveResult,
  ICardAdminEffectEditorValidationErrors,
  IParsedCardAdminEffectsPayload,
} from '@/views/admin/types/cardAdminEffectEditor'
import type { ICardCatalogEffectRequest } from '@/services/api/types/cardCatalog'

const EMPTY_VALIDATION_ERRORS: ICardAdminEffectEditorValidationErrors = {
  form: null,
  conditions: null,
  effects: null,
}

const EMPTY_DRAFT: ICardAdminEffectEditorDraft = {
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

function isLeaderType(cardType: string): boolean {
  return cardType.trim().toLowerCase() === 'leader'
}

function toEditorDraft(card: ICardAdminEffectEditorHydrationSource | null): ICardAdminEffectEditorDraft {
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
    effects: card.effects.map((effect) => ({ ...effect })),
  }
}

function normalizeEffectForSave(effect: ICardCatalogEffectRequest): ICardCatalogEffectRequest {
  return {
    ...effect,
    passiveConsequences: (effect.passiveConsequences ?? []).map((consequence) => ({
      consequenceEffectTypeKey: consequence.consequenceEffectTypeKey,
      targetPolicy: consequence.targetPolicy,
    })),
  }
}

function parseEditorPayload(draft: ICardAdminEffectEditorDraft): {
  payload: IParsedCardAdminEffectsPayload | null
  errors: ICardAdminEffectEditorValidationErrors
} {
  const nextErrors: ICardAdminEffectEditorValidationErrors = {
    ...EMPTY_VALIDATION_ERRORS,
  }

  if (!Array.isArray(draft.conditions) || !draft.conditions.every((entry) => typeof entry === 'string')) {
    nextErrors.conditions = 'Conditions must be a list of strings.'
  }

  if (!Array.isArray(draft.effects)) {
    nextErrors.effects = 'Effects must be a list.'
  } else if (!draft.effects.every((effect) =>
    effect.id.trim().length > 0
    && effect.effectType.trim().length > 0
    && effect.timing.trim().length > 0
    && effect.durationMode.trim().length > 0
    && Array.isArray(effect.contextRules)
    && !!effect.targetRules)) {
    nextErrors.effects = 'Each effect must include id, effectType, timing, contextRules, and targetRules.'
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

function getErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return 'Failed to save effect payload.'
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
      const lines = [title || 'Validation failed while saving.', '']
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

  return error.message || 'Failed to save effect payload.'
}

export function useCardAdminEffectEditorModel(
  selectedCard: ICardAdminEffectEditorHydrationSource,
): ICardAdminEffectEditorModel {
  const mutation = useUpdateCardCatalogEffectsMutation()
  const [draft, setDraft] = useState<ICardAdminEffectEditorDraft>(() => toEditorDraft(selectedCard))
  const [initialDraft, setInitialDraft] = useState<ICardAdminEffectEditorDraft>(() => toEditorDraft(selectedCard))
  const [errors, setErrors] = useState<ICardAdminEffectEditorValidationErrors>(EMPTY_VALIDATION_ERRORS)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialDraft),
    [draft, initialDraft],
  )

  const setDescription = useCallback((value: string) => {
    setDraft((current) => ({ ...current, description: value }))
  }, [])

  const setType = useCallback((value: string) => {
    setDraft((current) => {
      if (isLeaderType(value)) {
        return {
          ...current,
          type: value,
          life: current.life ?? current.health ?? 0,
          health: null,
        }
      }

      return {
        ...current,
        type: value,
        health: current.health ?? current.life ?? 0,
        life: null,
      }
    })
  }, [])

  const setColor = useCallback((value: string) => {
    setDraft((current) => ({ ...current, color: value }))
  }, [])

  const setPower = useCallback((value: number) => {
    setDraft((current) => ({ ...current, power: value }))
  }, [])

  const setDamage = useCallback((value: number) => {
    setDraft((current) => ({ ...current, damage: value }))
  }, [])

  const setLife = useCallback((value: number | null) => {
    setDraft((current) => ({ ...current, life: value }))
  }, [])

  const setHealth = useCallback((value: number | null) => {
    setDraft((current) => ({ ...current, health: value }))
  }, [])

  const setSupportEffect = useCallback((value: string) => {
    setDraft((current) => ({ ...current, supportEffect: value }))
  }, [])

  const setCannotBeNormalSummoned = useCallback((value: boolean) => {
    setDraft((current) => ({ ...current, cannotBeNormalSummoned: value }))
  }, [])

  const toggleCondition = useCallback((value: string) => {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return
    }

    setDraft((current) => {
      const hasCondition = current.conditions.includes(normalizedValue)
      return {
        ...current,
        conditions: hasCondition
          ? current.conditions.filter((entry) => entry !== normalizedValue)
          : [...current.conditions, normalizedValue],
      }
    })
  }, [])

  const addCondition = useCallback((value: string) => {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return
    }

    setDraft((current) => {
      if (current.conditions.includes(normalizedValue)) {
        return current
      }

      return {
        ...current,
        conditions: [...current.conditions, normalizedValue],
      }
    })
  }, [])

  const removeCondition = useCallback((value: string) => {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return
    }

    setDraft((current) => ({
      ...current,
      conditions: current.conditions.filter((entry) => entry !== normalizedValue),
    }))
  }, [])

  const setEffects = useCallback((value: ICardCatalogEffectRequest[]) => {
    setDraft((current) => ({ ...current, effects: value }))
  }, [])

  const reset = useCallback(() => {
    setDraft(initialDraft)
    setErrors(EMPTY_VALIDATION_ERRORS)
    setStatusMessage(null)
  }, [initialDraft])

  const save = useCallback(async (): Promise<ICardAdminEffectEditorSaveResult> => {
    const parsed = parseEditorPayload(draft)
    setErrors(parsed.errors)

    if (!parsed.payload) {
      return {
        ok: false,
        message: 'Fix validation errors before saving.',
      }
    }

    try {
      const updatedCard = await mutation.mutateAsync({
        cardId: selectedCard.id,
        payload: {
          type: draft.type,
          color: draft.color,
          power: draft.power,
          damage: draft.damage,
          life: isLeaderType(draft.type) ? (draft.life ?? 0) : undefined,
          health: isLeaderType(draft.type) ? undefined : (draft.health ?? 0),
          description: draft.description,
          supportEffect: draft.supportEffect,
          cannotBeNormalSummoned: draft.cannotBeNormalSummoned,
          conditions: parsed.payload.conditions.length > 0 ? parsed.payload.conditions : undefined,
          effects: parsed.payload.effects,
        },
      })

      const nextDraft = toEditorDraft(updatedCard)
      setDraft(nextDraft)
      setInitialDraft(nextDraft)
      setErrors(EMPTY_VALIDATION_ERRORS)
      setStatusMessage('Card effects saved successfully.')

      return {
        ok: true,
        message: null,
      }
    } catch (error) {
      const message = getErrorMessage(error)
      setErrors((current) => ({
        ...current,
        form: message,
      }))
      setStatusMessage(null)

      return {
        ok: false,
        message,
      }
    }
  }, [draft, mutation, selectedCard])

  return {
    draft,
    errors,
    isDirty,
    isSaving: mutation.isPending,
    statusMessage,
    setType,
    setColor,
    setPower,
    setDamage,
    setLife,
    setHealth,
    setDescription,
    setSupportEffect,
    setCannotBeNormalSummoned,
    toggleCondition,
    addCondition,
    removeCondition,
    setEffects,
    reset,
    save,
  }
}
