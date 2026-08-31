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
  'attack-declaration': 'Attack Declaration',
  'effect-declaration': 'Effect Declaration',
  'support-cut-in': 'Support Cut-In',
  'damage-step': 'Damage Step',
}

const AttackSequenceStepMeta = {
  AttackDeclaration: {
    stepLabel: 'Step 1/3',
    detail: 'Attack target has been declared.',
    owner: 'active',
  },
  SupportCutIn: {
    stepLabel: 'Step 2/3',
    detail: 'Quick/support responses resolve via priority.',
    owner: 'priority',
  },
  DamageStep: {
    stepLabel: 'Step 3/3',
    detail: 'Damage resolves automatically.',
    owner: 'system',
  },
} as const

function getPhaseValue(gameInstance: IGameStateResponse, authUserId?: string): string {
  const normalizedAuthUserId = normalizeId(authUserId)
  const normalizedActivePlayerId = normalizeId(gameInstance.activePlayerId)
  const isPlayerTurn = normalizedAuthUserId.length > 0 && normalizedActivePlayerId === normalizedAuthUserId

  const otherPlayer = gameInstance.players.length > 1

  if (!otherPlayer) {
    return PhaseValues['w-for-players']
  } else {
    if (gameInstance.isAttackSequencePending && gameInstance.attackSequenceStage) {
      if (gameInstance.attackSequenceStage === 'AttackDeclaration') {
        return PhaseValues['attack-declaration']
      }

      if (gameInstance.attackSequenceStage === 'EffectDeclaration') {
        return PhaseValues['effect-declaration']
      }

      if (gameInstance.attackSequenceStage === 'SupportCutIn') {
        return PhaseValues['support-cut-in']
      }

      if (gameInstance.attackSequenceStage === 'DamageStep') {
        return PhaseValues['damage-step']
      }
    }

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

function getAttackSequenceGuidance(gameInstance: IGameStateResponse, authUserId?: string): string | null {
  if (!gameInstance.isAttackSequencePending || !gameInstance.attackSequenceStage) {
    return null
  }

  const stage = gameInstance.attackSequenceStage
  if (!(stage in AttackSequenceStepMeta)) {
    return null
  }

  const stageMeta = AttackSequenceStepMeta[stage as keyof typeof AttackSequenceStepMeta]
  const normalizedAuthUserId = normalizeId(authUserId)
  const normalizedActivePlayerId = normalizeId(gameInstance.activePlayerId)
  const normalizedPriorityPlayerId = normalizeId(gameInstance.priorityPlayerId)

  let windowLabel = 'System window'
  if (stageMeta.owner === 'active') {
    windowLabel = normalizedAuthUserId.length > 0 && normalizedAuthUserId === normalizedActivePlayerId
      ? 'Your window'
      : "Opponent's window"
  }

  if (stageMeta.owner === 'priority') {
    windowLabel = normalizedAuthUserId.length > 0 && normalizedAuthUserId === normalizedPriorityPlayerId
      ? 'Your priority'
      : "Opponent's priority"
  }

  return `${stageMeta.stepLabel} - ${windowLabel}. ${stageMeta.detail}`
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
  const attackSequenceGuidance = getAttackSequenceGuidance(gameInstance, authUserId)

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
          className={`min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] py-0.5 text-center transition-[max-width,transform,opacity] duration-300 ease-out ${phaseThemeClasses}`}
        >
          <span key={phaseValue} className="phase-indicator-text-swap inline-block text-[12px] font-extrabold leading-none">
            {phaseValue}
          </span>
          {attackSequenceGuidance ? (
            <p className="mt-0.5 px-1 text-[9px] font-semibold leading-tight opacity-85">
              {attackSequenceGuidance}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export { GamePhaseActionRow }