import type { IPromptPresentation } from '@/views/game/types/promptPresentation'

export type IGamePromptOverlayProps = {
  isOpen: boolean
  prompt: IPromptPresentation | null
  isConnected: boolean
  isActionPending: boolean
  onResolve: (selectedOption: string) => void
}
