import type { IPendingPromptResponse } from '@/services/api/types/game'

export type IPromptPresentationOption = {
  value: string
  label: string
}

export type IPromptPresentation = {
  promptType: string
  title: string
  subtitle: string
  isAwaitingRequestingPlayer: boolean
  renderAsOverlay: boolean
  options: IPromptPresentationOption[]
  /**
   * Set for effect selection prompts ('Effect'): the copy bucket the server published, the zone the candidate
   * cards live in ('Hand', 'Deck', 'Trash', ...), which decides which collection the overlay renders, and the
   * player that owns that zone.
   */
  selectionPromptKind?: string | null
  candidateZone?: string | null
  candidatePlayerId?: string | null
}

export type IPromptPresentationSource = IPendingPromptResponse | null
