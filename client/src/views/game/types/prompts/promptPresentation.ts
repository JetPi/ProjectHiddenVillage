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
  selectionPromptKind?: string | null
  candidateZone?: string | null
  candidatePlayerId?: string | null
}

export type IPromptPresentationSource = IPendingPromptResponse | null
