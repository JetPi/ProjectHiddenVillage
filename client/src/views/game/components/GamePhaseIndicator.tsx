import type { IGamePhaseIndicatorProps } from '@/views/game/types'
import { PhaseValues } from './constants/gamePhaseActionRow'
import { getPhaseValue } from '@/views/game/utils/functions/helpers'

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
