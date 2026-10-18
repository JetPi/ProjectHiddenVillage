import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteCardArt } from '@/services/api/cardArtApi'
import { useUploadCardArtMutation } from '@/services/queries/cardArtQueries'
import { useUpdateCardCatalogImageMutation } from '@/services/queries/cardQueries'
import { getCardAdminRequestErrorMessage } from '@/views/admin/model/cardAdminEffectPayload'
import {
  CARD_ART_WIDTHS,
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

/**
 * Replacing the art of a card that already exists, held back until the card is saved.
 *
 * Nothing here talks to the server while the author is still deciding: a picked file is previewed from an object
 * URL, a URL is staged as it is typed, and a removal is staged as an intention. `commit` is the only request path,
 * and the screen's save is what runs it - upload first for a file, then the image reference that points the card at
 * whichever won. That is the whole point of the draft: an upload is no longer a save of its own, so browsing for a
 * file or pasting a wrong URL cannot change a card that is already in the catalogue.
 */
export function useCardAdminArtDraft(card: ICardCatalogItemResponse): ICardAdminArtDraftModel {
  const uploadMutation = useUploadCardArtMutation()
  const updateImageMutation = useUpdateCardCatalogImageMutation()

  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [stagedPreviewSrc, setStagedPreviewSrc] = useState<string | null>(null)
  const [urlValue, setUrlValueState] = useState('')
  const [isRemovalStaged, setIsRemovalStaged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // An object URL outlives the state that made it, so the unmount cleanup needs the one that is live when the
  // screen goes away. Only the URL is held here - a ref is not where a rendered value belongs.
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

      // A URL the author is typing supersedes a picked file, so exactly one change is ever pending.
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

      // Points the card at the change. This is what moves the card's version, so every client drops the old image.
      await updateImageMutation.mutateAsync({ cardId: card.id, image })
    } catch (commitError) {
      const message = getCardAdminRequestErrorMessage(commitError)

      setError(message)

      // The staged change is kept, so the author can press save again instead of picking the file a second time.
      return { ok: false, message }
    }

    if (isRemoving) {
      // The card points at nothing now, so an unreferenced master is the sweep's business if this call fails.
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

  return {
    previewSrc,
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
