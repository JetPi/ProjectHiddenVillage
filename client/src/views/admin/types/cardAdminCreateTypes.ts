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
  /** Added one at a time with Enter; each entry is a name clients can match on. */
  name: string[]
  originalId: string
  /** Added one at a time with Enter, with existing catalogue values offered as suggestions. */
  traits: string[]
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
  /** Existing catalogue values offered as suggestions; free-text entry is still allowed. */
  traitOptions: string[]
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
  /** Existing traits for the token field; empty when the metadata read fails. */
  traitOptions: string[]
  editorModel: ICardAdminEffectEditorFieldsModel
  image: ICardAdminCreateImageState
  uploadImage: (file: File) => void
  clearImage: () => void
  submit: () => Promise<ICardAdminCreateSubmitResult>
  isSubmitting: boolean
  identityError: string | null
}
