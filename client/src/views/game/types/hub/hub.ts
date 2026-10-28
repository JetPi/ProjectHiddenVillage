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
  acknowledgePhasePresentation: (presentationId: string) => Promise<boolean>
  /** Ends the game on this player's own request; resolves false when the server refused or the call failed. */
  forfeitGame: () => Promise<boolean>
  /** Asks the opponent to let the board go back one move; resolves false when the server refused the request. */
  requestRedo: () => Promise<boolean>
  /** Answers the opponent's redo request; resolves false when the server refused or the call failed. */
  respondToRedo: (requestId: string, accepted: boolean) => Promise<boolean>
  /** Withdraws this player's own redo request; a request that is already gone is not an error. */
  cancelRedo: () => Promise<boolean>
  getCardActionTargets: (
    request: Omit<IGameCardActionTargetsRequest, 'playerId'>,
  ) => Promise<IGameCardActionTargetsResponse | null>
  /** Posts one chat message; resolves false when the server refused it or the call failed. */
  sendChatMessage: (text: string) => Promise<boolean>
  refreshGameState: () => Promise<boolean>
}
