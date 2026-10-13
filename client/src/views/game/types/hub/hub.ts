import type { IGameStateResponse } from '@/services/api/gameApi'
import type {
  IGameCardActionExecutionRequest,
  IGameCardActionTargetsRequest,
  IGameCardActionTargetsResponse,
} from '@/services/api/types/gameHub'

export type IGameHubActionIntent =
  | 'pass-turn'
  | 'declare-action'
  | 'declare-attack'
  | 'execute-card-action'
  | 'declare-end-step'
  | 'complete-end-step'
  | 'resolve-prompt'

export type ISubmitHubIntentRequest =
  | {
      intent: 'pass-turn' | 'declare-action' | 'declare-attack' | 'declare-end-step' | 'complete-end-step'
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
  /**
   * Confirms to the engine that this board has finished presenting its last phase transition. It deliberately
   * does **not** go through `submitHubIntent`: an acknowledgement is not a player action, so it must never set
   * `isActionPending` (the flag the buttons and the prompts key off) and must not be refused by the intent
   * guards. Resolves true when the server took it.
   */
  acknowledgePhasePresentation: (presentationId: string) => Promise<boolean>
  getCardActionTargets: (
    request: Omit<IGameCardActionTargetsRequest, 'playerId'>,
  ) => Promise<IGameCardActionTargetsResponse | null>
  refreshGameState: () => Promise<boolean>
}
