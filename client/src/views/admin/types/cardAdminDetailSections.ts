import type { ICardAdminEffectEditorModel } from '@/views/admin/types/cardAdminEffectEditor'
import type { ICardCatalogEffectRequest } from '@/services/api/types/cardCatalog'

export type ICardAdminConditionsSectionProps = {
  editorModel: ICardAdminEffectEditorModel
  conditionToAdd: string
  setConditionToAdd: (value: string) => void
  availableConditionOptions: string[]
}

export type ICardAdminLinkedEffectGroup = {
  sourceId: string
  onSuccessTarget: string | null
  onFailureTarget: string | null
}

export type ICardAdminEffectsSectionProps = {
  parsedEffects: ICardCatalogEffectRequest[]
  collapsedEffects: Set<number>
  toggleEffectCollapsedAt: (effectIndex: number) => void
  reorderEffect: (fromIndex: number, toIndex: number) => void
  removeEffectAt: (effectIndex: number) => void
  addEffect: () => void
  updateEffectAt: (effectIndex: number, updater: (effect: ICardCatalogEffectRequest) => ICardCatalogEffectRequest) => void
  effectIdOptions: string[]
  linkedEffectGroups: ICardAdminLinkedEffectGroup[]
  effectConditionKeywordOptions: string[]
  effectsError: string | null
  effectBranchErrors: Record<number, string[]>
}
