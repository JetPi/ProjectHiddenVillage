import { useCallback, useState } from 'react'
import i18n from '@/i18n'
import { deleteCardArt } from '@/services/api/cardArtApi'
import { useUploadCardArtMutation } from '@/services/queries/cardArtQueries'
import { useUpdateCardCatalogImageMutation } from '@/services/queries/cardQueries'
import { getCardAdminRequestErrorMessage } from '@/views/admin/model/cardAdminEffectPayload'
import { CARD_ART_WIDTHS, resolveCardArtUrl } from '@/services/api/cardArt'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export type ICardAdminArtEditorModel = {
  /** What the card currently resolves for its art, refreshed by the version bump each apply causes. */
  previewSrc: string
  isUploading: boolean
  isBusy: boolean
  error: string | null
  statusMessage: string | null
  urlValue: string
  setUrlValue: (value: string) => void
  canApplyUrl: boolean
  applyFile: (file: File) => void
  applyUrl: () => void
  removeArt: () => void
}

/**
 * Replacing the art of a card that already exists. Unlike the create screen there is nothing to hold back: an
 * upload is stored and then the card is pointed at it immediately, and the preview is the art the card resolves,
 * so what the author sees is what was actually stored.
 */
export function useCardAdminArtEditorModel(card: ICardCatalogItemResponse): ICardAdminArtEditorModel {
  const uploadMutation = useUploadCardArtMutation()
  const updateImageMutation = useUpdateCardCatalogImageMutation()

  const [urlValue, setUrlValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const isBusy = uploadMutation.isPending || updateImageMutation.isPending

  const applyImage = useCallback(async (image: string, successMessage: string) => {
    setError(null)

    try {
      await updateImageMutation.mutateAsync({ cardId: card.id, image })
      setUrlValue('')
      setStatusMessage(successMessage)
    } catch (mutationError) {
      setStatusMessage(null)
      setError(getCardAdminRequestErrorMessage(mutationError))
    }
  }, [card.id, updateImageMutation])

  const applyFile = useCallback((file: File) => {
    setError(null)
    setStatusMessage(null)

    void uploadMutation
      .mutateAsync({ cardId: card.id, file })
      .then((result) => applyImage(result.reference, i18n.t('admin.art.applied')))
      .catch((uploadError: unknown) => {
        setError(getCardAdminRequestErrorMessage(uploadError))
      })
  }, [applyImage, card.id, uploadMutation])

  const applyUrl = useCallback(() => {
    const trimmed = urlValue.trim()
    if (!trimmed) {
      return
    }

    void applyImage(trimmed, i18n.t('admin.art.applied'))
  }, [applyImage, urlValue])

  const removeArt = useCallback(() => {
    // The reference is cleared before the master is deleted, so a failure between the two leaves a card with no
    // art rather than a card pointing at a file that is gone.
    void (async () => {
      await applyImage('', i18n.t('admin.art.removed'))

      try {
        await deleteCardArt(card.id)
      } catch {
        // The stored master is unreferenced now, so the sweep collects it even if this call fails.
      }
    })()
  }, [applyImage, card.id])

  return {
    previewSrc: resolveCardArtUrl(card, CARD_ART_WIDTHS.preview),
    isUploading: uploadMutation.isPending,
    isBusy,
    error,
    statusMessage,
    urlValue,
    setUrlValue,
    canApplyUrl: urlValue.trim().length > 0 && !isBusy,
    applyFile,
    applyUrl,
    removeArt,
  }
}
