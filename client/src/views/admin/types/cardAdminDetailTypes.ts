import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import type {
  ICardCatalogEffectRequest,
  IUpdateCardCatalogEffectsRequest,
} from '@/services/api/types/cardCatalog'

export type ICardAdminDetailPaneProps = {
  selectedCard: ICardCatalogItemResponse | null
  /** Reports whether the open draft has anything in it, for the screen's unsaved-changes guard. */
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  /** True while an exit is waiting on the author's answer, which is when the dialog is shown. */
  isExitPending?: boolean
  /** What the author answered: leave, or stay. */
  onExitResolved?: (shouldProceed: boolean) => void
}

export type ICardAdminDetailEditorProps = {
  selectedCard: ICardCatalogItemResponse
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void
  isExitPending?: boolean
  onExitResolved?: (shouldProceed: boolean) => void
}

/**
 * The art a card stores right now, shown read-only so reading it cannot turn into editing it by accident.
 */
export type ICardAdminStoredArt = {
  /** The stored value verbatim: an external URL, or a `local:` reference to a master on this server. */
  reference: string
  /** Where the source can be opened; null when there is nowhere useful to send the author. */
  href: string | null
  /** True for an external URL, which is what the link points at; false for a master we host ourselves. */
  isExternal: boolean
}

/** The art change an author has made but not saved yet. One of these is pending at a time, never a mix. */
export type ICardAdminPendingArt =
  | { kind: 'file'; fileName: string }
  | { kind: 'url'; url: string }
  | { kind: 'remove' }

export type ICardAdminArtCommitResult = {
  ok: boolean
  message: string | null
}

export type ICardAdminArtDraftModel = {
  /** What the preview paints: the staged change, or the art the card currently resolves. */
  previewSrc: string
  /** The art the card stores now, read-only. Null while it has none. */
  storedArt: ICardAdminStoredArt | null
  /** The staged change, or null while the art matches what is saved. */
  pending: ICardAdminPendingArt | null
  isDirty: boolean
  isCommitting: boolean
  error: string | null
  /** The external-URL alternative: what the field holds, staged for the next save. */
  urlValue: string
  setUrlValue: (value: string) => void
  selectFile: (file: File) => void
  stageRemoval: () => void
  /** Drops the staged change and paints the art the card actually has again. */
  discard: () => void
  /** Sends the staged change. The only thing in this model that talks to the server. */
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

/**
 * The identity fields a summary can render. A new card has no stored row to read them from, which is why the
 * create flow supplies them separately from the card.
 */
export type ICardAdminSummaryIdentitySource = Pick<
  ICardCatalogItemResponse,
  'id' | 'displayName' | 'supportCost'
>

/** Present only in create mode, where the card id and display name are still being chosen. */
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

// Effect editor model

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

/**
 * Everything the editor sections need: the draft and the ways to change it. The submit differs per screen (a
 * patch on the update screen, a create on the new-card screen), so it is added on top rather than shared.
 */
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
  /** True while a submit is in flight; the body only uses it to hold its own controls still. */
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

// Effect panels

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
