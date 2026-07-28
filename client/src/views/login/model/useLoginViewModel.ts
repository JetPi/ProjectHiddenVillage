import { useLoginViewStore } from '../../../state/loginViewStore'

export function useLoginViewModel() {
  const displayName = useLoginViewStore((state) => state.displayName)
  const gameCodeMode = useLoginViewStore((state) => state.gameCodeMode)
  const gameCodeByMode = useLoginViewStore((state) => state.gameCodeByMode)
  const deckOptionsMode = useLoginViewStore((state) => state.deckOptionsMode)
  const deckOptionsByMode = useLoginViewStore((state) => state.deckOptionsByMode)
  const showDisplayNameError = useLoginViewStore((state) => state.showDisplayNameError)
  
  const setDisplayName = useLoginViewStore((state) => state.setDisplayName)
  const setGameCodeMode = useLoginViewStore((state) => state.setGameCodeMode)
  const setGameCodeValue = useLoginViewStore((state) => state.setGameCodeValue)
  const setDeckOptionsMode = useLoginViewStore((state) => state.setDeckOptionsMode)
  const setDeckOptionValue = useLoginViewStore((state) => state.setDeckOptionValue)
  const validateDisplayName = useLoginViewStore((state) => state.validateDisplayName)

  return {
    displayName,
    gameCodeMode,
    deckOptionsMode,
    showDisplayNameError,
    activeGameCode: gameCodeByMode[gameCodeMode],
    activeDeckOption: deckOptionsByMode[deckOptionsMode],
    setDisplayName,
    setGameCodeMode,
    setDeckOptionsMode,
    setGameCodeValue,
    setDeckOptionValue,
    validateDisplayName,
  }
}
