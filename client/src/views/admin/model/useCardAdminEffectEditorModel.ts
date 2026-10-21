import { useCallback } from 'react'
import i18n from '@/i18n'
import { useUpdateCardCatalogEffectsMutation } from '@/services/queries/cardQueries'
import {
  getCardAdminRequestErrorMessage,
  isLeaderType,
  parseEditorPayload,
  toEditorDraft,
} from '@/views/admin/model/cardAdminEffectPayload'
import { useCardAdminEffectDraft } from '@/views/admin/model/useCardAdminEffectDraft'
import type {
  ICardAdminEffectEditorHydrationSource,
  ICardAdminEffectEditorModel,
  ICardAdminEffectEditorSaveResult,
} from '@/views/admin/types/cardAdminDetailTypes'

export function useCardAdminEffectEditorModel(
  selectedCard: ICardAdminEffectEditorHydrationSource,
): ICardAdminEffectEditorModel {
  const mutation = useUpdateCardCatalogEffectsMutation()
  const {
    draft,
    rebaseline,
    setErrors,
    setStatusMessage,
    ...draftFields
  } = useCardAdminEffectDraft(selectedCard)

  const save = useCallback(async (): Promise<ICardAdminEffectEditorSaveResult> => {
    const parsed = parseEditorPayload(draft)
    setErrors(parsed.errors)

    if (!parsed.payload) {
      return {
        ok: false,
        message: i18n.t('admin.validation.fixErrors'),
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

      rebaseline(toEditorDraft(updatedCard))
      setStatusMessage(i18n.t('admin.validation.cardEffectsSaved'))

      return {
        ok: true,
        message: null,
      }
    } catch (error) {
      const message = getCardAdminRequestErrorMessage(error)
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
  }, [draft, mutation, rebaseline, selectedCard, setErrors, setStatusMessage])

  return {
    ...draftFields,
    draft,
    isSaving: mutation.isPending,
    save,
  }
}
