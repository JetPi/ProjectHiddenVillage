import { useCallback, useEffect, useRef, useState } from 'react'
import i18n from '@/i18n'
import {
  useCardCatalogTraitsQuery,
  useCreateCardCatalogEntryMutation,
} from '@/services/queries/cardQueries'
import { useUploadCardArtMutation } from '@/services/queries/cardArtQueries'
import { deleteCardArt } from '@/services/api/cardArtApi'
import {
  getCardAdminRequestErrorMessage,
  isLeaderType,
  parseEditorPayload,
} from '@/views/admin/model/cardAdminEffectPayload'
import { useCardAdminEffectDraft } from '@/views/admin/model/useCardAdminEffectDraft'
import type {
  ICardAdminCreateImageState,
  ICardAdminCreateModel,
  ICardAdminCreateSubmitResult,
  ICardAdminIdentityDraft,
} from '@/views/admin/types/cardAdminCreateTypes'
import type { ICreateCardRequest } from '@/services/api/types/cardCatalog'

const EMPTY_IDENTITY: ICardAdminIdentityDraft = {
  cardId: '',
  displayName: '',
  name: [],
  traits: [],
  imageUrl: '',
}

function optionalList(values: string[]): string[] | undefined {
  return values.length > 0 ? values : undefined
}

function trimmedOrUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * The unload bookkeeping for an upload that never became a card: what is stored, under which card id, and
 * whether a card was created from it. Held in a ref because the unmount cleanup needs the latest values.
 */
type UploadCleanupState = {
  reference: string | null
  cardId: string | null
  consumedByCreate: boolean
}

/**
 * The create screen's state: identity, the art upload, and the submit that posts the new card. The effects half
 * is the same draft hook the update screen uses, hydrated from nothing, so both screens validate identically.
 */
export function useCardAdminCreateModel(): ICardAdminCreateModel {
  const createMutation = useCreateCardCatalogEntryMutation()
  const uploadMutation = useUploadCardArtMutation()
  const traitsQuery = useCardCatalogTraitsQuery()
  const editorModel = useCardAdminEffectDraft(null)

  const [identity, setIdentity] = useState<ICardAdminIdentityDraft>(EMPTY_IDENTITY)
  const [identityError, setIdentityError] = useState<string | null>(null)
  const [uploadedReference, setUploadedReference] = useState<string | null>(null)
  const [uploadedCardId, setUploadedCardId] = useState<string | null>(null)
  const [uploadPreviewSrc, setUploadPreviewSrc] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)

  const uploadCleanupRef = useRef<UploadCleanupState>({
    reference: null,
    cardId: null,
    consumedByCreate: false,
  })

  useEffect(() => {
    uploadCleanupRef.current = {
      ...uploadCleanupRef.current,
      reference: uploadedReference,
      cardId: uploadedCardId,
    }
  }, [uploadedCardId, uploadedReference])

  useEffect(() => {
    return () => {
      // Leaving the screen with an upload that never became a card would leave a master on disk that nothing
      // refers to. Best effort: the request may not survive the unload.
      const pending = uploadCleanupRef.current
      if (pending.reference && pending.cardId && !pending.consumedByCreate) {
        void deleteCardArt(pending.cardId).catch(() => {
          // An orphaned file is wasted disk, not a broken screen.
        })
      }
    }
  }, [])

  useEffect(() => {
    return () => {
      setUploadPreviewSrc((current) => {
        if (current) {
          URL.revokeObjectURL(current)
        }

        return null
      })
    }
  }, [])

  const releasePreview = useCallback(() => {
    setUploadPreviewSrc((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }

      return null
    })
  }, [])

  const clearImage = useCallback(() => {
    releasePreview()
    setUploadedReference(null)
    setUploadedCardId(null)
    setImageError(null)
  }, [releasePreview])

  const uploadImage = useCallback((file: File) => {
    const cardId = identity.cardId.trim()
    if (!cardId) {
      setImageError(i18n.t('admin.create.image.cardIdRequired'))
      return
    }

    setImageError(null)

    void uploadMutation
      .mutateAsync({ cardId, file })
      .then((result) => {
        releasePreview()
        setUploadPreviewSrc(URL.createObjectURL(file))
        setUploadedReference(result.reference)
        setUploadedCardId(cardId)
      })
      .catch((error: unknown) => {
        setImageError(getCardAdminRequestErrorMessage(error))
      })
  }, [identity.cardId, releasePreview, uploadMutation])

  const setIdentityField = useCallback((patch: Partial<ICardAdminIdentityDraft>) => {
    setIdentity((current) => {
      const next = { ...current, ...patch }

      // A stored master is keyed by the card id, so a reference uploaded for a previous id cannot be used for
      // the card being created now - the server refuses it, and the author has to upload again.
      if (patch.cardId !== undefined && current.cardId.trim() !== next.cardId.trim()) {
        setUploadedReference(null)
        setUploadedCardId(null)
        setImageError(next.cardId.trim().length === 0 ? null : i18n.t('admin.create.image.cardIdChanged'))
      }

      return next
    })

    if (patch.cardId !== undefined || patch.displayName !== undefined) {
      setIdentityError(null)
    }
  }, [])

  const summaryIdentity = {
    cardId: identity.cardId,
    displayName: identity.displayName,
    onCardIdChange: (value: string) => setIdentityField({ cardId: value }),
    onDisplayNameChange: (value: string) => setIdentityField({ displayName: value }),
  }

  const image: ICardAdminCreateImageState = {
    previewSrc: uploadPreviewSrc ?? trimmedOrUndefined(identity.imageUrl) ?? null,
    isUploading: uploadMutation.isPending,
    uploadedReference,
    error: imageError,
  }

  const submit = useCallback(async (): Promise<ICardAdminCreateSubmitResult> => {
    const cardId = identity.cardId.trim()
    const displayName = identity.displayName.trim()

    if (!cardId) {
      const message = i18n.t('admin.create.validation.cardIdRequired')
      setIdentityError(message)
      return { ok: false, message }
    }

    if (!displayName) {
      const message = i18n.t('admin.create.validation.displayNameRequired')
      setIdentityError(message)
      return { ok: false, message }
    }

    const parsed = parseEditorPayload(editorModel.draft)
    editorModel.setErrors(parsed.errors)

    if (!parsed.payload) {
      return { ok: false, message: i18n.t('admin.validation.fixErrors') }
    }

    const draft = editorModel.draft
    const request: ICreateCardRequest = {
      cardId,
      displayName,
      image: trimmedOrUndefined(identity.imageUrl) ?? uploadedReference ?? undefined,
      name: optionalList(identity.name),
      traits: optionalList(identity.traits),
      type: draft.type,
      color: draft.color,
      power: draft.power,
      damage: draft.damage,
      life: isLeaderType(draft.type) ? (draft.life ?? 0) : undefined,
      health: isLeaderType(draft.type) ? undefined : (draft.health ?? 0),
      description: draft.description,
      supportEffect: trimmedOrUndefined(draft.supportEffect),
      cannotBeNormalSummoned: draft.cannotBeNormalSummoned,
      conditions: parsed.payload.conditions.length > 0 ? parsed.payload.conditions : undefined,
      effects: parsed.payload.effects,
    }

    try {
      await createMutation.mutateAsync({ payload: request })

      // Marked here rather than from state: the screen navigates away on success, so a state-driven flag would
      // not have committed before the unmount cleanup ran, and the art of the card just created would be
      // deleted as if it had been abandoned.
      uploadCleanupRef.current = {
        ...uploadCleanupRef.current,
        consumedByCreate: true,
      }

      editorModel.rebaseline({ ...draft })

      return { ok: true, message: null }
    } catch (error) {
      const message = getCardAdminRequestErrorMessage(error)
      editorModel.setErrors((current) => ({ ...current, form: message }))

      return { ok: false, message }
    }
  }, [createMutation, editorModel, identity, uploadedReference])

  return {
    identity,
    summaryIdentity,
    setIdentityField,
    traitOptions: traitsQuery.data ?? [],
    editorModel,
    image,
    uploadImage,
    clearImage,
    submit,
    isSubmitting: createMutation.isPending,
    identityError,
  }
}
