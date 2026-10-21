import { api } from '@/services/api/httpClient'
import type { ICardArtUploadResult } from '@/services/api/types/cardArt'

export async function uploadCardArt(cardId: string, file: File): Promise<ICardArtUploadResult> {
  const formData = new FormData()
  formData.append('file', file)

  const { data } = await api.post<ICardArtUploadResult>(
    `/api/card-art/${encodeURIComponent(cardId)}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )

  return data
}

export async function deleteCardArt(cardId: string): Promise<void> {
  await api.delete(`/api/card-art/${encodeURIComponent(cardId)}`)
}
