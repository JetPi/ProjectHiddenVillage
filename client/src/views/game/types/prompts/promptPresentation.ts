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
   * Set for effect selection prompts ('Effect'): the copy bucket the server published and the zone the
   * candidate cards live in ('Hand', 'Deck', ...), which decides which collection the overlay renders.
   */
  selectionPromptKind?: string | null
  candidateZone?: string | null
}

export type IPromptPresentationSource = IPendingPromptResponse | null
