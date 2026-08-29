import type { IGameStateResponse } from '@/services/api/gameApi'
import type { IGamePhaseActionRowProps } from '@/views/game/types/gamePhaseActionRow'

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
    if (gameInstance.pendingPrompt && !gameInstance.pendingPrompt.isAwaitingRequestingPlayer) {
      if (gameInstance.pendingPrompt.type.toLowerCase() === 'mulligan') {
        return PhaseValues['w-for-opponent-to-mulligan']
      }
      return PhaseValues['w-for-opponent-to-choose']
    }
  }

  return isPlayerTurn ? PhaseValues['player-turn'] : PhaseValues['opponent-turn']
}

function getPhaseThemeClasses(phaseValue: string): string {
  switch (phaseValue) {
    case PhaseValues['w-for-players']:
      return 'turn-indicator-light-gray turn-indicator-text-black'
    case PhaseValues['player-turn']:
      return 'turn-indicator-orange turn-indicator-text-light-theme'
    default:
      return 'turn-indicator-blue turn-indicator-text-dark-theme'
  }
}

function GamePhaseActionRow({
  gameInstance,
  authUserId,
  availableActions,
  isConnected,
  isActionPending,
  onSelectAction,
  phaseTestId,
}: IGamePhaseActionRowProps) {
  const phaseValue = getPhaseValue(gameInstance, authUserId)
  const phaseThemeClasses = getPhaseThemeClasses(phaseValue)
  const hasOptions = availableActions.length > 0

  return (
    <div className="grid min-h-0 grid-cols-6">
      <div className="col-span-6 flex min-h-0 min-w-0 items-stretch gap-1">
        <div
          className={`overflow-hidden transition-[max-width,opacity] duration-300 ease-out ${
            hasOptions ? 'max-w-[55%] opacity-100' : 'pointer-events-none max-w-0 opacity-0'
          }`}
        >
          <div className="flex h-full w-max items-stretch gap-1 overflow-x-auto">
            {availableActions.map((action) => (
              <button
                key={action.actionId}
                type="button"
                onClick={() => {
                  onSelectAction(action)
                }}
                disabled={!isConnected || isActionPending || !action.isEnabled}
                title={action.disabledReason ?? undefined}
                className={`h-full shrink-0 whitespace-nowrap rounded-md border border-[var(--border-subtle)] px-1.5 text-[10px] font-extrabold leading-none transition-colors duration-300 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${phaseThemeClasses}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>

        <div
          data-testid={phaseTestId}
          className={`min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] py-0.5 text-center text-[12px] font-extrabold leading-none transition-[max-width,transform,opacity] duration-300 ease-out ${phaseThemeClasses}`}
        >
          <span key={phaseValue} className="phase-indicator-text-swap inline-block">
            {phaseValue}
          </span>
        </div>
      </div>
    </div>
  )
}

export { GamePhaseActionRow }