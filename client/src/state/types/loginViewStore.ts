import type { IDeckOptionsEntryMode, IGameEntryMode, IRulesetMode } from "@/types/login"

export type ILoginViewStoreState = {
  displayName: string
  gameEntryMode: IGameEntryMode
  joinGameCode: string
  rulesetIdByMode: Record<IRulesetMode, string>
  /** Host-only: a "time relaxed" table runs without the action clock. Quick match never carries it. */
  hostTimeRelaxed: boolean
  deckOptionsMode: IDeckOptionsEntryMode
  deckOptionsByMode: Record<IDeckOptionsEntryMode, string>
  showDisplayNameError: boolean
  setDisplayName: (value: string) => void
  setGameEntryMode: (mode: IGameEntryMode) => void
  setJoinGameCode: (value: string) => void
  setRulesetId: (mode: IRulesetMode, value: string) => void
  setHostTimeRelaxed: (value: boolean) => void
  setDeckOptionsMode: (mode: IDeckOptionsEntryMode) => void
  setDeckOptionValue: (value: string) => void
  validateDisplayName: () => boolean
  reset: () => void
}
