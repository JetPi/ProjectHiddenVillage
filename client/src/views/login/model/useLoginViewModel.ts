import { useLoginViewStore } from '@/state/loginViewStore'
import { useShallow } from 'zustand/react/shallow'

export function useLoginViewModel() {
  return useLoginViewStore(
    useShallow((state) => ({
      displayName: state.displayName,
      gameEntryMode: state.gameEntryMode,
      deckOptionsMode: state.deckOptionsMode,
      showDisplayNameError: state.showDisplayNameError,
      joinGameCode: state.joinGameCode,
      quickmatchRulesetId: state.rulesetIdByMode.quickmatch,
      hostRulesetId: state.rulesetIdByMode.host,
      hostTimeRelaxed: state.hostTimeRelaxed,
      activeDeckOption: state.deckOptionsByMode[state.deckOptionsMode],
      importDeckOption: state.deckOptionsByMode.import,
      savedDeckOption: state.deckOptionsByMode.saved_decks,
      starterDeckOption: state.deckOptionsByMode.starter_decks,
      setDisplayName: state.setDisplayName,
      setGameEntryMode: state.setGameEntryMode,
      setDeckOptionsMode: state.setDeckOptionsMode,
      setHostTimeRelaxed: state.setHostTimeRelaxed,
      setJoinGameCode: state.setJoinGameCode,
      setRulesetId: state.setRulesetId,
      setDeckOptionValue: state.setDeckOptionValue,
      setDeckOptionValueForMode: state.setDeckOptionValueForMode,
      validateDisplayName: state.validateDisplayName,
    })),
  )
}
