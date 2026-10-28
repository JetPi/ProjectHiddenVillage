import type { IDeckOptionsEntryMode, IGameEntryMode, IRulesetMode } from "@/types/login"

/**
 * What the login panel remembers between visits: the configuration a player would otherwise re-pick before every
 * single match, plus the name they play under. The join code is deliberately absent - it belongs to one match.
 */
export type IPersistedLoginViewState = {
  displayName: string
  gameEntryMode: IGameEntryMode
  rulesetIdByMode: Record<IRulesetMode, string>
  hostTimeRelaxed: boolean
  deckOptionsMode: IDeckOptionsEntryMode
  deckOptionsByMode: Record<IDeckOptionsEntryMode, string>
}

export type ILoginViewStoreState = IPersistedLoginViewState & {
  joinGameCode: string
  showDisplayNameError: boolean
  setDisplayName: (value: string) => void
  setGameEntryMode: (mode: IGameEntryMode) => void
  setJoinGameCode: (value: string) => void
  setRulesetId: (mode: IRulesetMode, value: string) => void
  setHostTimeRelaxed: (value: boolean) => void
  setDeckOptionsMode: (mode: IDeckOptionsEntryMode) => void
  setDeckOptionValue: (value: string) => void
  /** Writes the choice for one mode, so a correction can land on a mode that is not the one on screen. */
  setDeckOptionValueForMode: (mode: IDeckOptionsEntryMode, value: string) => void
  validateDisplayName: () => boolean
  reset: () => void
}
