import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { ICardCatalogEffectRequest, IUpdateCardCatalogEffectsRequest } from '@/services/api/types/cardCatalog'

export type ICardAdminEffectEditorDraft = {
  description: string
  supportEffect: string
  cannotBeNormalSummoned: boolean
  conditions: string[]
  effectsText: string
}

export type ICardAdminEffectEditorValidationErrors = {
  form: string | null
  conditions: string | null
  effectsText: string | null
}

export type ICardAdminEffectEditorSaveResult = {
  ok: boolean
  message: string | null
}

export type ICardAdminEffectEditorModel = {
  draft: ICardAdminEffectEditorDraft
  errors: ICardAdminEffectEditorValidationErrors
  isDirty: boolean
  isSaving: boolean
  statusMessage: string | null
  setDescription: (value: string) => void
  setSupportEffect: (value: string) => void
  setCannotBeNormalSummoned: (value: boolean) => void
  toggleCondition: (value: string) => void
  addCondition: (value: string) => void
  removeCondition: (value: string) => void
  setEffectsText: (value: string) => void
  reset: () => void
  save: () => Promise<ICardAdminEffectEditorSaveResult>
}

export type ICardAdminEffectEditorHydrationSource = Pick<
  ICardCatalogItemResponse,
  'id' | 'description' | 'supportEffect' | 'cannotBeNormalSummoned' | 'conditions' | 'effects'
>

export type IParsedCardAdminEffectsPayload = {
  conditions: string[]
  effects: ICardCatalogEffectRequest[]
}

export type ICardAdminEffectPatchPayload = IUpdateCardCatalogEffectsRequest
