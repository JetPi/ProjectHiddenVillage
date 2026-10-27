import type { IDeckOptionsEntryMode, IGameEntryMode, IRulesetMode } from "@/types/login"

export type ILoginViewStoreState = {
  displayName: string
  gameEntryMode: IGameEntryMode
  joinGameCode: string
  rulesetIdByMode: Record<IRulesetMode, string>
  deckOptionsMode: IDeckOptionsEntryMode
  deckOptionsByMode: Record<IDeckOptionsEntryMode, string>
  showDisplayNameError: boolean
  setDisplayName: (value: string) => void
  setGameEntryMode: (mode: IGameEntryMode) => void
  setJoinGameCode: (value: string) => void
  setRulesetId: (mode: IRulesetMode, value: string) => void
  setDeckOptionsMode: (mode: IDeckOptionsEntryMode) => void
  setDeckOptionValue: (value: string) => void
  validateDisplayName: () => boolean
  reset: () => void
}
