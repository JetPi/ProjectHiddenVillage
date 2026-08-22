import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type { ICardCatalogEffectRequest, IUpdateCardCatalogEffectsRequest } from '@/services/api/types/cardCatalog'

export type ICardAdminEffectEditorDraft = {
  type: string
  color: string
  power: number
  damage: number
  life: number | null
  health: number | null
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
  setType: (value: string) => void
  setColor: (value: string) => void
  setPower: (value: number) => void
  setDamage: (value: number) => void
  setLife: (value: number | null) => void
  setHealth: (value: number | null) => void
  toggleCondition: (value: string) => void
  addCondition: (value: string) => void
  removeCondition: (value: string) => void
  setEffectsText: (value: string) => void
  reset: () => void
  save: () => Promise<ICardAdminEffectEditorSaveResult>
}

export type ICardAdminEffectEditorHydrationSource = Pick<
  ICardCatalogItemResponse,
  | 'id'
  | 'type'
  | 'color'
  | 'power'
  | 'damage'
  | 'life'
  | 'health'
  | 'description'
  | 'supportEffect'
  | 'cannotBeNormalSummoned'
  | 'conditions'
  | 'effects'
>

export type IParsedCardAdminEffectsPayload = {
  conditions: string[]
  effects: ICardCatalogEffectRequest[]
}

export type ICardAdminEffectPatchPayload = IUpdateCardCatalogEffectsRequest
