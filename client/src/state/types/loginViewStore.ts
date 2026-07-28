import type { DeckOptionsEntryMode, GameCodeEntryMode } from "../../types/login"

export type LoginViewStoreState = {
  displayName: string
  gameCodeMode: GameCodeEntryMode
  gameCodeByMode: Record<GameCodeEntryMode, string>
  deckOptionsMode: DeckOptionsEntryMode
  deckOptionsByMode: Record<DeckOptionsEntryMode, string>
  showDisplayNameError: boolean
  setDisplayName: (value: string) => void
  setGameCodeMode: (mode: GameCodeEntryMode) => void
  setGameCodeValue: (value: string) => void
  setDeckOptionsMode: (mode: DeckOptionsEntryMode) => void
  setDeckOptionValue: (value: string) => void
  validateDisplayName: () => boolean
  reset: () => void
}