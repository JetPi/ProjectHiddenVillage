import type {
  ICardAdminEffectEditorFieldsModel,
  ICardAdminSummaryIdentityDraft,
} from './cardAdminDetailTypes'

/**
 * The identity fields the create screen owns. Card id and display name are edited in the shared summary at the
 * top of the editor (that is where the update screen displays them), so they live here but are rendered there.
 */
export type ICardAdminIdentityDraft = {
  cardId: string
  displayName: string
  /** Free text, one entry per line or comma separated. */
  name: string
  originalId: string
  attribute: string
  /** Free text, one entry per line or comma separated. */
  traits: string
  mainAlternate: boolean
  /** An external image URL, used when the author does not upload a file. */
  imageUrl: string
}

export type ICardAdminCreateImageState = {
  /** What the preview renders: an object URL for an upload, or the typed URL. */
  previewSrc: string | null
  isUploading: boolean
  /** The `local:` reference an upload returned, which is what the create request sends. */
  uploadedReference: string | null
  error: string | null
}

export type ICardAdminIdentityPanelProps = {
  draft: ICardAdminIdentityDraft
  onChange: (patch: Partial<ICardAdminIdentityDraft>) => void
  image: ICardAdminCreateImageState
  onUploadFile: (file: File) => void
  onClearUpload: () => void
  disabled: boolean
}

export type ICardAdminCreateSubmitResult = {
  ok: boolean
  message: string | null
}

export type ICardAdminCreateModel = {
  identity: ICardAdminIdentityDraft
  /** The editable identity slice the shared summary renders. */
  summaryIdentity: ICardAdminSummaryIdentityDraft
  setIdentityField: (patch: Partial<ICardAdminIdentityDraft>) => void
  editorModel: ICardAdminEffectEditorFieldsModel
  image: ICardAdminCreateImageState
  uploadImage: (file: File) => void
  clearImage: () => void
  submit: () => Promise<ICardAdminCreateSubmitResult>
  isSubmitting: boolean
  identityError: string | null
}
