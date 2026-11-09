import type { IAdaptiveFieldConfig, IToggleOption } from '@/components/forms'
import type { IDeckRulesetEvaluation } from '@/domain/deck/types'
import type { IDeckOptionsEntryMode, IGameEntryMode } from '@/types/login'

export type ILoginDisplayNameFieldProps = {
  displayName: string
  onDisplayNameChange: (value: string) => void
  showError: boolean
  onlineViewers: number | null
  onToggleTheme: () => void
  /** A real account, not a guest session: it only decides which dialog the strip opens. */
  isAuthenticated: boolean
  onOpenSessionDialog: () => void
  className?: string
}

export type ILoginGameEntryPanelProps = {
  gameEntryMode: IGameEntryMode
  gameEntryModeOptions: readonly IToggleOption<IGameEntryMode>[]
  onGameEntryModeChange: (mode: IGameEntryMode) => void
  quickmatchRulesetId: string
  quickmatchRulesetConfig: IAdaptiveFieldConfig
  onQuickmatchRulesetChange: (rulesetId: string) => void
  canQuickmatch: boolean
  hostRulesetId: string
  hostRulesetConfig: IAdaptiveFieldConfig
  onHostRulesetChange: (rulesetId: string) => void
  joinGameCode: string
  joinGameCodeConfig: IAdaptiveFieldConfig
  onJoinGameCodeChange: (gameCode: string) => void
  hostTimeRelaxed: boolean
  onHostTimeRelaxedChange: (value: boolean) => void
  /** A game action is already in flight, or the server is closed for maintenance. */
  isBusy: boolean
  isMaintenance: boolean
  className?: string
}

export type ILoginDeckPanelProps = {
  deckOptionsMode: IDeckOptionsEntryMode
  deckOptionsModeOptions: readonly IToggleOption<IDeckOptionsEntryMode>[]
  onDeckOptionsModeChange: (mode: IDeckOptionsEntryMode) => void
  deckOptionValue: string
  deckFieldConfig: IAdaptiveFieldConfig
  onDeckOptionChange: (value: string) => void
  showStarterDeckRetry: boolean
  onRetryStarterDecks: () => void
  showGuestSavedDeckHint: boolean
  onOpenImportDialog: () => void
  hasImportError: boolean
  summaryDeckName: string | null
  summaryEvaluation: IDeckRulesetEvaluation | null
  isCheckingSummary: boolean
  /** Already worded and empty when the selected deck has no record to show. */
  summaryRecordLabel: string | null
  className?: string
}
