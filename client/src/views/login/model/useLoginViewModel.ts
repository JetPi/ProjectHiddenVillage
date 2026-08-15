import { useLoginViewStore } from '@/state/loginViewStore'
import { useShallow } from 'zustand/react/shallow'

export function useLoginViewModel() {
  return useLoginViewStore(
    useShallow((state) => ({
      displayName: state.displayName,
      gameCodeMode: state.gameCodeMode,
      deckOptionsMode: state.deckOptionsMode,
      showDisplayNameError: state.showDisplayNameError,
      activeGameCode: state.gameCodeByMode[state.gameCodeMode],
      activeDeckOption: state.deckOptionsByMode[state.deckOptionsMode],
      setDisplayName: state.setDisplayName,
      setGameCodeMode: state.setGameCodeMode,
      setDeckOptionsMode: state.setDeckOptionsMode,
      setGameCodeValue: state.setGameCodeValue,
      setDeckOptionValue: state.setDeckOptionValue,
      validateDisplayName: state.validateDisplayName,
    })),
  )
}
