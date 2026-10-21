import type {
  ICardAdminEffectEditorFieldsModel,
  ICardAdminSummaryIdentityDraft,
} from './cardAdminDetailTypes'

export type ICardAdminIdentityDraft = {
  cardId: string
  displayName: string
  name: string[]
  traits: string[]
  imageUrl: string
}

export type ICardAdminCreateImageState = {
  previewSrc: string | null
  isUploading: boolean
  uploadedReference: string | null
  error: string | null
}

export type ICardAdminIdentityPanelProps = {
  draft: ICardAdminIdentityDraft
  onChange: (patch: Partial<ICardAdminIdentityDraft>) => void
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
  summaryIdentity: ICardAdminSummaryIdentityDraft
  setIdentityField: (patch: Partial<ICardAdminIdentityDraft>) => void
  traitOptions: string[]
  editorModel: ICardAdminEffectEditorFieldsModel
  image: ICardAdminCreateImageState
  uploadImage: (file: File) => void
  clearImage: () => void
  submit: () => Promise<ICardAdminCreateSubmitResult>
  isSubmitting: boolean
  identityError: string | null
}
