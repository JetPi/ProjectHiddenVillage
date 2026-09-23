import type { IPromptPresentation } from './promptPresentation'

/**
 * A candidate card the player can pick from an effect selection prompt. Only the fields the prompt overlay
 * needs to draw a card face - the caller resolves them from whichever collection the prompt names.
 */
export type IGamePromptCandidateCard = {
  instanceId: string
  displayName: string
  /** Minimal catalog shape that drives CardImage's cached board art. */
  card?: { id: string; image: string; imageVersion?: number | null } | null
}

export type IGamePromptOverlayProps = {
  isOpen: boolean
  prompt: IPromptPresentation | null
  isConnected: boolean
  isActionPending: boolean
  onResolve: (selectedOption: string) => void
  /** Candidates for an 'Effect' prompt, so the overlay can render real card faces instead of id chips. */
  candidateCards?: IGamePromptCandidateCard[]
}
