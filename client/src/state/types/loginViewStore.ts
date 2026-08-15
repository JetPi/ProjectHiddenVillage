import type { IDeckOptionsEntryMode, IGameCodeEntryMode } from "@/types/login"

export type ILoginViewStoreState = {
  displayName: string
  gameCodeMode: IGameCodeEntryMode
  gameCodeByMode: Record<IGameCodeEntryMode, string>
  deckOptionsMode: IDeckOptionsEntryMode
  deckOptionsByMode: Record<IDeckOptionsEntryMode, string>
  showDisplayNameError: boolean
  setDisplayName: (value: string) => void
  setGameCodeMode: (mode: IGameCodeEntryMode) => void
  setGameCodeValue: (value: string) => void
  setDeckOptionsMode: (mode: IDeckOptionsEntryMode) => void
  setDeckOptionValue: (value: string) => void
  validateDisplayName: () => boolean
  reset: () => void
}