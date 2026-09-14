const phaseActionChipClassName =
  'h-full shrink-0 whitespace-nowrap rounded-md border border-[var(--border-subtle)] px-1.5 text-[10px] font-extrabold leading-none transition-[color,background-color,filter] duration-300 ease-out enabled:hover:brightness-120'

const invertedPhaseThemeClassByPhaseTheme: Record<string, string> = {
  'turn-indicator-orange turn-indicator-text-light-theme': 'turn-indicator-inverted-orange',
  'turn-indicator-blue turn-indicator-text-dark-theme': 'turn-indicator-inverted-blue',
  'turn-indicator-light-gray turn-indicator-text-black': 'turn-indicator-inverted-light-gray',
}

const PhaseValues = {
  'w-for-players': 'Waiting for player',
  'w-for-opponent': 'Waiting for opponent',
  'player-turn': 'Your turn',
  'opponent-turn': "Opponent's turn",
  'w-for-opponent-to-choose': 'Waiting for opponent to choose',
  'w-for-opponent-to-pick-starter': 'Waiting for opponent to choose who goes first',
  'w-for-opponent-to-mulligan': 'Waiting for opponent to choose mulligan',
  'your-attack-declaration': 'Your Attack Declaration',
  'opponent-attack-declaration': "Opponent Declares Attack",
  'effect-declaration': 'Effect Declaration',
  'your-support-cut-in': 'Your Support Cut-In',
  'opponent-support-cut-in': "Opponent Support Cut-In",
  'damage-step': 'Damage Step',
  'selecting-tribute-materials': 'Selecting tribute materials',
  'fulfilled-tribute-requirements': 'Fulfilled tribute requirements',
}

export { phaseActionChipClassName, invertedPhaseThemeClassByPhaseTheme, PhaseValues }