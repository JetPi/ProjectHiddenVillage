import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type {
  ICardCatalogEffectRequest,
  IUpdateCardCatalogEffectsRequest,
} from '@/services/api/types/cardCatalog'

export type ICardAdminDetailPaneProps = {
  selectedCard: ICardCatalogItemResponse | null
  isLoading?: boolean
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  isExitPending?: boolean
  onExitResolved?: (shouldProceed: boolean) => void
}

export type ICardAdminDetailEditorProps = {
  selectedCard: ICardCatalogItemResponse
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  isExitPending?: boolean
  onExitResolved?: (shouldProceed: boolean) => void
}

export type ICardAdminStoredArt = {
  reference: string
  href: string | null
  isExternal: boolean
}

export type ICardAdminPendingArt =
  | { kind: 'file'; fileName: string }
  | { kind: 'url'; url: string }
  | { kind: 'remove' }

export type ICardAdminArtCommitResult = {
  ok: boolean
  message: string | null
}

export type ICardAdminArtDraftModel = {
  previewSrc: string
  storedArt: ICardAdminStoredArt | null
  pending: ICardAdminPendingArt | null
  isDirty: boolean
  isCommitting: boolean
  error: string | null
  urlValue: string
  setUrlValue: (value: string) => void
  selectFile: (file: File) => void
  stageRemoval: () => void
  discard: () => void
  commit: () => Promise<ICardAdminArtCommitResult>
}

export type ICardAdminSelectedCardSummaryDraft = {
  type: string
  color: string
  power: number
  damage: number
  life: number | null
  health: number | null
}

export type ICardAdminSummaryIdentitySource = Pick<
  ICardCatalogItemResponse,
  'id' | 'displayName' | 'supportCost'
>

export type ICardAdminSummaryIdentityDraft = {
  cardId: string
  displayName: string
  onCardIdChange: (value: string) => void
  onDisplayNameChange: (value: string) => void
}

export type ICardAdminSelectedCardSummaryProps = {
  card: ICardAdminSummaryIdentitySource
  draft: ICardAdminSelectedCardSummaryDraft
  identity?: ICardAdminSummaryIdentityDraft
  onTypeChange: (value: string) => void
  onColorChange: (value: string) => void
  onPowerChange: (value: number) => void
  onDamageChange: (value: number) => void
  onLifeChange: (value: number) => void
  onHealthChange: (value: number) => void
}

export type ICardAdminConditionsSectionProps = {
  editorModel: ICardAdminEffectEditorFieldsModel
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
  effects: ICardCatalogEffectRequest[]
}

export type ICardAdminEffectEditorValidationErrors = {
  form: string | null
  conditions: string | null
  effects: string | null
  effectBranches: Record<number, string[]>
}

export type ICardAdminEffectEditorSaveResult = {
  ok: boolean
  message: string | null
}

export type ICardAdminEffectEditorFieldsModel = {
  draft: ICardAdminEffectEditorDraft
  errors: ICardAdminEffectEditorValidationErrors
  isDirty: boolean
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
  setEffects: (value: ICardCatalogEffectRequest[]) => void
  reset: () => void
}

export type ICardAdminEffectEditorModel = ICardAdminEffectEditorFieldsModel & {
  isSaving: boolean
  save: () => Promise<ICardAdminEffectEditorSaveResult>
}

export type ICardAdminEffectEditorBodyProps = {
  editorModel: ICardAdminEffectEditorFieldsModel
  card: ICardAdminSummaryIdentitySource
  identity?: ICardAdminSummaryIdentityDraft
  isBusy?: boolean
}

export type ICardAdminEditorFooterProps = {
  isDirty: boolean
  isSaving: boolean
  submitLabel: string
  savingLabel: string
  disabled?: boolean
  onSubmit: () => void | Promise<void>
}

export type ICardAdminEditorDraftCommit = (nextDraft: ICardAdminEffectEditorDraft) => void

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


export type IUpdateEffectAt = (
  effectIndex: number,
  updater: (effect: ICardCatalogEffectRequest) => ICardCatalogEffectRequest,
) => void

export type ICardAdminEffectPanelBaseProps = {
  effect: ICardCatalogEffectRequest
  effectIndex: number
  updateEffectAt: IUpdateEffectAt
}

export type ICardAdminExecutionPanelProps = ICardAdminEffectPanelBaseProps & {
  effectBranchErrors?: string[]
}

export type ICardAdminTargetRulesPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminContextRulesPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminSummonSettingsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminGainEffectPanelProps = ICardAdminEffectPanelBaseProps & {
  effectConditionKeywordOptions: string[]
}

export type ICardAdminAttributeModificationsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminChakraAdjustmentsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminFaceStateFlipsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminFaceStateLocksPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminMoveCardActionsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminSearchCardPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminRevealCardPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminPassiveSettingsPanelProps = ICardAdminEffectPanelBaseProps

export type ICardAdminContextRulePlayerPanelProps = {
  audience: 'player' | 'opponent'
  title: string
  effect: ICardCatalogEffectRequest
  effectIndex: number
  contextRuleIndex: number
  updateEffectAt: IUpdateEffectAt
}
