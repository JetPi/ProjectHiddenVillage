import type { IPromptPresentation } from './promptPresentation'

export type IGamePromptCandidateCard = {
  instanceId: string
  displayName: string
  card?: { id: string; image: string; imageVersion?: number | null } | null
}

export type IGamePromptOverlayProps = {
  isOpen: boolean
  prompt: IPromptPresentation | null
  isConnected: boolean
  isActionPending: boolean
  onResolve: (selectedOption: string) => void
  candidateCards?: IGamePromptCandidateCard[]
}
