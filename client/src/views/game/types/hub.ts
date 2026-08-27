import type { IGameStateResponse } from '@/services/api/gameApi'
import type { IGameCardActionExecutionRequest } from '@/services/api/types/gameHub'

export type IGameHubActionIntent =
  | 'pass-turn'
  | 'declare-action'
  | 'execute-card-action'
  | 'advance-phase'
  | 'declare-end-step'
  | 'complete-end-step'
  | 'resolve-prompt'

export type ISubmitHubIntentRequest =
  | {
      intent: 'pass-turn' | 'declare-action' | 'advance-phase' | 'declare-end-step' | 'complete-end-step'
    }
  | {
      intent: 'execute-card-action'
      actionId: string
      sourceCardInstanceId: string
      selectedTargets?: IGameCardActionExecutionRequest['selectedTargets']
      arguments?: IGameCardActionExecutionRequest['arguments']
    }
  | {
      intent: 'execute-card-action'
      actionId: `set-support:${string}`
      sourceCardInstanceId: string
      selectedTargets?: IGameCardActionExecutionRequest['selectedTargets']
      arguments: IGameCardActionExecutionRequest['arguments'] & {
        supportSlotIndex: string
      }
    }
  | {
      intent: 'resolve-prompt'
      selectedOption: string
    }

export type IUseGameHubStateResult = {
  gameState: IGameStateResponse
  isConnected: boolean
  isActionPending: boolean
  connectionError: string | null
  actionError: string | null
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
}
