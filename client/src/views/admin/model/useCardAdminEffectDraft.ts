import { useCallback, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import {
  EMPTY_VALIDATION_ERRORS,
  isLeaderType,
  toEditorDraft,
} from '@/views/admin/model/cardAdminEffectPayload'
import type {
  ICardAdminEffectEditorDraft,
  ICardAdminEffectEditorFieldsModel,
  ICardAdminEffectEditorHydrationSource,
  ICardAdminEffectEditorValidationErrors,
} from '@/views/admin/types/cardAdminDetailTypes'
import type { ICardCatalogEffectRequest } from '@/services/api/types/cardCatalog'

export type ICardAdminEffectDraftModel = ICardAdminEffectEditorFieldsModel & {
  setErrors: Dispatch<SetStateAction<ICardAdminEffectEditorValidationErrors>>
  setStatusMessage: Dispatch<SetStateAction<string | null>>
  /** Re-baselines the draft after a server round-trip, so the screen stops reporting unsaved changes. */
  rebaseline: (nextDraft: ICardAdminEffectEditorDraft) => void
}

/**
 * The editing state both card screens share: what the draft holds, what changing a field does, and whether it
 * has drifted from what the server last confirmed. Hydrating from `null` is a new card, which is how the create
 * screen reuses this.
 */
export function useCardAdminEffectDraft(
  hydrationSource: ICardAdminEffectEditorHydrationSource | null,
): ICardAdminEffectDraftModel {
  const [draft, setDraft] = useState<ICardAdminEffectEditorDraft>(() => toEditorDraft(hydrationSource))
  const [initialDraft, setInitialDraft] = useState<ICardAdminEffectEditorDraft>(() => toEditorDraft(hydrationSource))
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
      // A leader carries Life where every other type carries Health, so switching type moves the value across
      // rather than dropping it.
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

  const rebaseline = useCallback((nextDraft: ICardAdminEffectEditorDraft) => {
    setDraft(nextDraft)
    setInitialDraft(nextDraft)
    setErrors(EMPTY_VALIDATION_ERRORS)
  }, [])

  return {
    draft,
    errors,
    isDirty,
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
    setErrors,
    setStatusMessage,
    rebaseline,
  }
}
