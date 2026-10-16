import { api } from '@/services/api/httpClient'
import type { ICardArtUploadResult } from '@/services/api/types/cardArt'

/**
 * Uploads a card art master for an admin-authored card. The card id is part of the path because the server keys
 * the stored master by it, so the create screen must have a card id before it can upload.
 */
export async function uploadCardArt(cardId: string, file: File): Promise<ICardArtUploadResult> {
  const formData = new FormData()
  formData.append('file', file)

  const { data } = await api.post<ICardArtUploadResult>(
    `/api/card-art/${encodeURIComponent(cardId)}`,
    formData,
    // The shared axios instance defaults to `application/json`; a multipart request has to leave the
    // content type open so the browser can supply its own boundary.
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )

  return data
}

/**
 * Removes a stored master. Called when an author abandons the create form, so an upload that never became a card
 * does not sit on disk forever.
 */
export async function deleteCardArt(cardId: string): Promise<void> {
  await api.delete(`/api/card-art/${encodeURIComponent(cardId)}`)
}
