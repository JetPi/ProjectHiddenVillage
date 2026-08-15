import type { IGameStateResponse } from '@/services/api/gameApi'
import type { IGamePhaseIndicatorProps } from '@/views/game/types/gamePhaseIndicator'

function normalizeId(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/-/g, '')
}

const PhaseValues = {
  'w-for-players': 'Waiting for player',
  'w-for-opponent': 'Waiting for opponent',
  'player-turn': 'Your turn',
  'opponent-turn': "Opponent's turn",
  'w-for-opponent-to-choose': 'Waiting for opponent to choose',
  'w-for-opponent-to-mulligan': 'Waiting for opponent to choose mulligan',
}

function getPhaseValue(gameInstance: IGameStateResponse, authUserId?: string): string {
  const normalizedAuthUserId = normalizeId(authUserId)
  const normalizedActivePlayerId = normalizeId(gameInstance.activePlayerId)
  const isPlayerTurn = normalizedAuthUserId.length > 0 && normalizedActivePlayerId === normalizedAuthUserId

  const otherPlayer = gameInstance.players.length > 1

  if (!otherPlayer) {
    return PhaseValues['w-for-players']
  } else {
    if(gameInstance.pendingPrompt && !gameInstance.pendingPrompt.isAwaitingRequestingPlayer) {
      if(gameInstance.pendingPrompt.type.toLowerCase() === 'mulligan'){
        return PhaseValues['w-for-opponent-to-mulligan']
      }
      return PhaseValues['w-for-opponent-to-choose']
    }
  }

  return isPlayerTurn ? PhaseValues['player-turn'] : PhaseValues['opponent-turn']
}

function GamePhaseIndicator({ gameInstance, authUserId }: IGamePhaseIndicatorProps) {
  const phaseValue = getPhaseValue(gameInstance, authUserId)

  const indicatorThemeClasses =
    phaseValue === PhaseValues['w-for-players']
      ? 'turn-indicator-light-gray turn-indicator-text-black'
      : phaseValue === PhaseValues['player-turn']
        ? 'turn-indicator-orange turn-indicator-text-light-theme'
        : 'turn-indicator-blue turn-indicator-text-dark-theme'

  return (
    <div className="grid min-h-0 grid-cols-6">
      <div
        className={`text-[12px] col-span-6 rounded-md border border-[var(--border-subtle)] py-0.5 text-center font-extrabold leading-none transition-colors duration-300 ease-out ${
          indicatorThemeClasses
        }`}
      >
        <span key={phaseValue} className="phase-indicator-text-swap inline-block">
          {phaseValue}
        </span>
      </div>
    </div>
  )
}

export { GamePhaseIndicator }
