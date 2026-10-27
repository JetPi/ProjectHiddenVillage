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
      activeDeckOption: state.deckOptionsByMode[state.deckOptionsMode],
      setDisplayName: state.setDisplayName,
      setGameEntryMode: state.setGameEntryMode,
      setDeckOptionsMode: state.setDeckOptionsMode,
      setJoinGameCode: state.setJoinGameCode,
      setRulesetId: state.setRulesetId,
      setDeckOptionValue: state.setDeckOptionValue,
      validateDisplayName: state.validateDisplayName,
    })),
  )
}
