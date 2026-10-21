import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteCardArt } from '@/services/api/cardArtApi'
import { useUploadCardArtMutation } from '@/services/queries/cardArtQueries'
import { useUpdateCardCatalogImageMutation } from '@/services/queries/cardQueries'
import { getCardAdminRequestErrorMessage } from '@/views/admin/model/cardAdminEffectPayload'
import {
  CARD_ART_WIDTHS,
  cardArtUrl,
  isExternalCardArtReference,
  resolveCardArtSourceHref,
  resolveCardArtUrl,
} from '@/services/api/cardArt'
import type {
  ICardAdminArtCommitResult,
  ICardAdminArtDraftModel,
  ICardAdminPendingArt,
  ICardAdminStoredArt,
} from '@/views/admin/types/cardAdminDetailTypes'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'

export function useCardAdminArtDraft(card: ICardCatalogItemResponse): ICardAdminArtDraftModel {
  const uploadMutation = useUploadCardArtMutation()
  const updateImageMutation = useUpdateCardCatalogImageMutation()

  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [stagedPreviewSrc, setStagedPreviewSrc] = useState<string | null>(null)
  const [urlValue, setUrlValueState] = useState('')
  const [isRemovalStaged, setIsRemovalStaged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stagedPreviewRef = useRef<string | null>(null)

  useEffect(() => {
    stagedPreviewRef.current = stagedPreviewSrc
  }, [stagedPreviewSrc])

  useEffect(() => {
    return () => {
      if (stagedPreviewRef.current) {
        URL.revokeObjectURL(stagedPreviewRef.current)
      }
    }
  }, [])

  const releaseStagedFile = useCallback(() => {
    const previewSrc = stagedPreviewRef.current

    if (previewSrc) {
      URL.revokeObjectURL(previewSrc)
    }

    setStagedFile(null)
    setStagedPreviewSrc(null)
  }, [])

  const setUrlValue = useCallback(
    (value: string) => {
      setUrlValueState(value)

      if (value.trim().length > 0) {
        releaseStagedFile()
        setIsRemovalStaged(false)
      }

      setError(null)
    },
    [releaseStagedFile],
  )

  const selectFile = useCallback(
    (file: File) => {
      releaseStagedFile()
      setStagedFile(file)
      setStagedPreviewSrc(URL.createObjectURL(file))
      setUrlValueState('')
      setIsRemovalStaged(false)
      setError(null)
    },
    [releaseStagedFile],
  )

  const stageRemoval = useCallback(() => {
    releaseStagedFile()
    setUrlValueState('')
    setIsRemovalStaged(true)
    setError(null)
  }, [releaseStagedFile])

  const discard = useCallback(() => {
    releaseStagedFile()
    setUrlValueState('')
    setIsRemovalStaged(false)
    setError(null)
  }, [releaseStagedFile])

  const stagedUrl = urlValue.trim()
  const pending: ICardAdminPendingArt | null = stagedFile
    ? { kind: 'file', fileName: stagedFile.name }
    : stagedUrl.length > 0
      ? { kind: 'url', url: stagedUrl }
      : isRemovalStaged
        ? { kind: 'remove' }
        : null

  const storedReference = card.image.trim()
  const storedArt: ICardAdminStoredArt | null =
    storedReference.length > 0
      ? {
          reference: storedReference,
          href: resolveCardArtSourceHref(card, CARD_ART_WIDTHS.preview),
          isExternal: isExternalCardArtReference(storedReference),
        }
      : null

  const commit = useCallback(async (): Promise<ICardAdminArtCommitResult> => {
    const hasUrl = stagedUrl.length > 0
    const isRemoving = isRemovalStaged

    if (!stagedFile && !hasUrl && !isRemoving) {
      return { ok: true, message: null }
    }

    try {
      let image = ''

      if (stagedFile) {
        const uploaded = await uploadMutation.mutateAsync({ cardId: card.id, file: stagedFile })
        image = uploaded.reference
      } else if (hasUrl) {
        image = stagedUrl
      }

      await updateImageMutation.mutateAsync({ cardId: card.id, image })
    } catch (commitError) {
      const message = getCardAdminRequestErrorMessage(commitError)

      setError(message)

      return { ok: false, message }
    }

    if (isRemoving) {
      void deleteCardArt(card.id)
        .catch(() => {})
    }

    discard()

    return { ok: true, message: null }
  }, [card.id, discard, isRemovalStaged, stagedFile, stagedUrl, updateImageMutation, uploadMutation])

  const previewSrc = stagedFile
    ? (stagedPreviewSrc ?? '')
    : pending?.kind === 'url'
      ? urlValue
      : pending?.kind === 'remove'
        ? ''
        : resolveCardArtUrl(card, CARD_ART_WIDTHS.preview)

  const storedPreviewSrcSet = card.id
    ? [
        `${cardArtUrl(card.id, CARD_ART_WIDTHS.board, card.imageVersion)} ${CARD_ART_WIDTHS.board}w`,
        `${cardArtUrl(card.id, CARD_ART_WIDTHS.preview, card.imageVersion)} ${CARD_ART_WIDTHS.preview}w`,
      ].join(', ')
    : null

  return {
    previewSrc,
    previewSrcSet: pending === null ? storedPreviewSrcSet : null,
    storedArt,
    pending,
    isDirty: pending !== null,
    isCommitting: uploadMutation.isPending || updateImageMutation.isPending,
    error,
    urlValue,
    setUrlValue,
    selectFile,
    stageRemoval,
    discard,
    commit,
  }
}
