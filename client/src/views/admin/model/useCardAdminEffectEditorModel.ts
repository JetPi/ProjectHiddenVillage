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
  conditionsText: null,
  effectsText: null,
}

const EMPTY_DRAFT: ICardAdminEffectEditorDraft = {
  description: '',
  supportEffect: '',
  cannotBeNormalSummoned: false,
  conditionsText: '[]',
  effectsText: '[]',
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function toEditorDraft(card: ICardAdminEffectEditorHydrationSource | null): ICardAdminEffectEditorDraft {
  if (!card) {
    return EMPTY_DRAFT
  }

  return {
    description: card.description,
    supportEffect: card.supportEffect ?? '',
    cannotBeNormalSummoned: card.cannotBeNormalSummoned,
    conditionsText: toPrettyJson(card.conditions),
    effectsText: toPrettyJson(card.effects),
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isCardCatalogEffectRequest(value: unknown): value is ICardCatalogEffectRequest {
  if (!value || typeof value !== 'object') {
    return false
  }

  const effect = value as Partial<ICardCatalogEffectRequest>
  return (
    isNonEmptyString(effect.id)
    && isNonEmptyString(effect.effectType)
    && isNonEmptyString(effect.timing)
    && !!effect.targetRules
    && Array.isArray(effect.contextRules)
  )
}

function parseEditorPayload(draft: ICardAdminEffectEditorDraft): {
  payload: IParsedCardAdminEffectsPayload | null
  errors: ICardAdminEffectEditorValidationErrors
} {
  const nextErrors: ICardAdminEffectEditorValidationErrors = {
    ...EMPTY_VALIDATION_ERRORS,
  }

  let parsedConditions: unknown
  let parsedEffects: unknown

  try {
    parsedConditions = JSON.parse(draft.conditionsText)
  } catch {
    nextErrors.conditionsText = 'Conditions must be valid JSON.'
  }

  try {
    parsedEffects = JSON.parse(draft.effectsText)
  } catch {
    nextErrors.effectsText = 'Effects must be valid JSON.'
  }

  if (nextErrors.conditionsText || nextErrors.effectsText) {
    return {
      payload: null,
      errors: nextErrors,
    }
  }

  if (!Array.isArray(parsedConditions) || !parsedConditions.every((entry) => typeof entry === 'string')) {
    nextErrors.conditionsText = 'Conditions must be a JSON array of strings.'
  }

  if (!Array.isArray(parsedEffects) || parsedEffects.length === 0) {
    nextErrors.effectsText = 'Effects must be a non-empty JSON array.'
  } else if (!parsedEffects.every((entry) => isCardCatalogEffectRequest(entry))) {
    nextErrors.effectsText = 'Each effect must include id, effectType, timing, contextRules, and targetRules.'
  }

  if (nextErrors.conditionsText || nextErrors.effectsText) {
    return {
      payload: null,
      errors: nextErrors,
    }
  }

  const normalizedConditions = parsedConditions as string[]
  const normalizedEffects = parsedEffects as ICardCatalogEffectRequest[]

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

  const responseMessage = error.response?.data?.detail as string | undefined
  if (responseMessage && responseMessage.trim().length > 0) {
    return responseMessage
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

  const setSupportEffect = useCallback((value: string) => {
    setDraft((current) => ({ ...current, supportEffect: value }))
  }, [])

  const setCannotBeNormalSummoned = useCallback((value: boolean) => {
    setDraft((current) => ({ ...current, cannotBeNormalSummoned: value }))
  }, [])

  const setConditionsText = useCallback((value: string) => {
    setDraft((current) => ({ ...current, conditionsText: value }))
  }, [])

  const setEffectsText = useCallback((value: string) => {
    setDraft((current) => ({ ...current, effectsText: value }))
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
          description: draft.description,
          supportEffect: draft.supportEffect,
          cannotBeNormalSummoned: draft.cannotBeNormalSummoned,
          conditions: parsed.payload.conditions,
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
    setDescription,
    setSupportEffect,
    setCannotBeNormalSummoned,
    setConditionsText,
    setEffectsText,
    reset,
    save,
  }
}
