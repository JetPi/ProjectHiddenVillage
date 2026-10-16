import { useMutation } from '@tanstack/react-query'
import { uploadCardArt } from '@/services/api/cardArtApi'
import type { ICardArtUploadResult } from '@/services/api/types/cardArt'

export type IUploadCardArtMutationVariables = {
  cardId: string
  file: File
}

/**
 * Uploads an art master for a card id the author has already chosen. Nothing in the query cache describes art -
 * the bytes are fetched by `<img src>` through the anonymous card-art endpoint - so there is nothing to
 * invalidate here; the returned reference is what the create request then carries.
 */
export function useUploadCardArtMutation() {
  return useMutation<ICardArtUploadResult, Error, IUploadCardArtMutationVariables>({
    mutationFn: ({ cardId, file }) => uploadCardArt(cardId, file),
  })
}

// Removing an abandoned upload is deliberately *not* a mutation hook: it happens in an unmount cleanup, where
// the screen is already gone and nothing should re-render from its result. The create model calls the API
// function directly.
