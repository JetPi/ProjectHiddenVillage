import type { IPromptPresentation } from './promptPresentation'

export type IGamePromptOverlayProps = {
  isOpen: boolean
  prompt: IPromptPresentation | null
  isConnected: boolean
  isActionPending: boolean
  onResolve: (selectedOption: string) => void
}
