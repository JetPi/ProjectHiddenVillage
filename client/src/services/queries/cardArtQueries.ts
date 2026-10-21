import { useMutation } from '@tanstack/react-query'
import { uploadCardArt } from '@/services/api/cardArtApi'
import type { ICardArtUploadResult } from '@/services/api/types/cardArt'

export type IUploadCardArtMutationVariables = {
  cardId: string
  file: File
}

export function useUploadCardArtMutation() {
  return useMutation<ICardArtUploadResult, Error, IUploadCardArtMutationVariables>({
    mutationFn: ({ cardId, file }) => uploadCardArt(cardId, file),
  })
}

