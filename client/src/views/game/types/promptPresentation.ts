import type { IPendingPromptResponse } from '../../../services/api/types/game'

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
}

export type IPromptPresentationSource = IPendingPromptResponse | null
