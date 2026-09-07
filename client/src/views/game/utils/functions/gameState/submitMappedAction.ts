import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { IGameActionOptionResponse, IGameCardInstanceResponse } from '@/services/api/types/game'
import type { IGameCardActionTargetsRequest, IGameCardActionTargetsResponse } from '@/services/api/types/gameHub'
import type { IAttackTargetingState, IPendingCardTargetingState, ISubmitHubIntentRequest, ISummonTargetingState } from '@/views/game/types'
import { mapActionToHubIntent } from './helpers'
import { runSubmitThenZoneEntryAnimation } from './runSubmitThenZoneEntryAnimation'
import { trySubmitTargetedCardEffect } from './trySubmitTargetedCardEffect'

function resolveBattleSourceCardInstanceId(
  action: IGameActionOptionResponse,
  characterFieldCards: IGameCardInstanceResponse[],
  canResolvePrompt: boolean,
): string | null {
  const actionId = action.actionId
  const battleCardByActionId = characterFieldCards.find((card) =>
    (card.availableActions ?? []).some((option) => option.actionId === actionId))

  if (battleCardByActionId) {
    return battleCardByActionId.instanceId
  }

  const fallbackIntent = mapActionToHubIntent(action, canResolvePrompt)
  if (!fallbackIntent || fallbackIntent.intent !== 'execute-card-action') {
    return null
  }

  return fallbackIntent.sourceCardInstanceId
}

function submitMappedAction({
  action,
  canResolvePrompt,
  submitHubIntent,
  getCardActionTargets,
  characterFieldCards,
  setPendingSetSupportCardInstanceId,
  setPendingCardTargeting,
  setPendingSummonTargeting,
  beginBattleTargeting,
  beginEffectTargeting,
  beginSummonTargeting,
  bottomHandRowRef,
  boardZoneRef,
  currentBottomBattlefieldRawCards,
  setBottomBattlefieldDisplayOrder,
}: ISubmitMappedActionArgs): void {
  if (!action.isEnabled) {
    return
  }

  if (action.actionId.startsWith('leader-effect:')) {
    void trySubmitTargetedCardEffect({
      action,
      canResolvePrompt,
      submitHubIntent,
      getCardActionTargets,
      beginEffectTargeting,
    })
    return
  }

  const isBattleAction = action.actionId.startsWith('battle-action:')
    || action.label.trim().toLowerCase() === 'battle'

  if (isBattleAction) {
    const sourceCardInstanceId = resolveBattleSourceCardInstanceId(action, characterFieldCards, canResolvePrompt)
    if (!sourceCardInstanceId) {
      return
    }

    void (async () => {
      const targetsResponse = await getCardActionTargets({
        actionId: action.actionId,
        sourceCardInstanceId,
      })

      if (!targetsResponse || !targetsResponse.isEnabled || targetsResponse.validTargets.length === 0) {
        return
      }

      beginBattleTargeting({
        actionId: action.actionId,
        sourceCardInstanceId,
        validTargets: targetsResponse.validTargets,
      })
    })()

    return
  }

  if (action.actionId.startsWith('activate-support:')) {
    void trySubmitTargetedCardEffect({
      action,
      canResolvePrompt,
      submitHubIntent,
      getCardActionTargets,
      beginEffectTargeting,
    })
    return
  }

  if (action.actionId.startsWith('set-support:')) {
    const delimiterIndex = action.actionId.indexOf(':')
    if (delimiterIndex < 0 || delimiterIndex === action.actionId.length - 1) {
      return
    }

    setPendingSetSupportCardInstanceId(action.actionId.slice(delimiterIndex + 1))
    return
  }

  if (action.actionId.startsWith('summon-to-field:')) {
    const delimiterIndex = action.actionId.indexOf(':')
    if (delimiterIndex < 0 || delimiterIndex === action.actionId.length - 1) {
      return
    }

    const intentRequest = mapActionToHubIntent(action, canResolvePrompt)
    if (!intentRequest || intentRequest.intent !== 'execute-card-action') {
      return
    }

    const cardInstanceId = action.actionId.slice(delimiterIndex + 1)

    void (async () => {
      const targetsResponse = await getCardActionTargets({
        actionId: intentRequest.actionId,
        sourceCardInstanceId: intentRequest.sourceCardInstanceId,
      })

      if (!targetsResponse || !targetsResponse.isEnabled) {
        return
      }

      const shouldAutoSelectAll = targetsResponse.autoSelectAllValidTargets && targetsResponse.validTargets.length > 0
      const requiresSelection = typeof targetsResponse.exactTargetCount === 'number'
        || typeof targetsResponse.minimumTargetCount === 'number'
        || typeof targetsResponse.maximumTargetCount === 'number'
        || targetsResponse.validTargets.length > 0

      if (shouldAutoSelectAll) {
        const sourceCardElement = bottomHandRowRef.current?.querySelector<HTMLDivElement>(
          `[data-hand-instance-id="${cardInstanceId}"]`,
        ) ?? null
        const sourceRect = sourceCardElement?.getBoundingClientRect() ?? null
        const expectedBattlefieldSlotIndex = currentBottomBattlefieldRawCards.length

        await runSubmitThenZoneEntryAnimation({
          submitHubIntent,
          intentRequest: {
            intent: 'execute-card-action',
            actionId: intentRequest.actionId,
            sourceCardInstanceId: intentRequest.sourceCardInstanceId,
            selectedTargets: targetsResponse.validTargets.map((target) => ({
              playerId: target.playerId,
              zone: target.zone,
              cardInstanceId: target.cardInstanceId,
              isEffectResolutionStackTarget: target.isEffectResolutionStackTarget,
              effectResolutionEntryId: target.effectResolutionEntryId,
            })),
          },
          sourceRect,
          beforeAnimation: () => {
            setBottomBattlefieldDisplayOrder((previousOrder) => {
              const knownIds = new Set(currentBottomBattlefieldRawCards.map((card) => card.instanceId))
              const preservedIds = previousOrder.filter((instanceId) => knownIds.has(instanceId))
              if (preservedIds.includes(cardInstanceId)) {
                return preservedIds
              }

              return [...preservedIds, cardInstanceId]
            })
          },
          resolveDestinationElement: () => {
            const exactCardElement = boardZoneRef.current?.querySelector<HTMLElement>(
              `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${cardInstanceId}"]`,
            ) ?? null
            if (exactCardElement) {
              return exactCardElement
            }

            return boardZoneRef.current?.querySelector<HTMLElement>(
              `[data-zone="character-field-card"][data-slot-side="bottom"][data-slot-index="${expectedBattlefieldSlotIndex}"]`,
            ) ?? null
          },
          timeoutMs: 1800,
          maxFrames: 120,
        })
        return
      }

      if (requiresSelection) {
        beginSummonTargeting({
          actionId: intentRequest.actionId,
          sourceCardInstanceId: intentRequest.sourceCardInstanceId,
          validTargets: targetsResponse.validTargets,
          minimumTargetCount: targetsResponse.minimumTargetCount,
          maximumTargetCount: targetsResponse.maximumTargetCount,
          exactTargetCount: targetsResponse.exactTargetCount,
          autoSelectAllValidTargets: targetsResponse.autoSelectAllValidTargets,
          selectedTargets: [],
        })
        return
      }
      const sourceHandRowElement = bottomHandRowRef.current
      const sourceCardElement = sourceHandRowElement?.querySelector<HTMLDivElement>(
        `[data-hand-instance-id="${cardInstanceId}"]`,
      ) ?? null
      const sourceRect = sourceCardElement?.getBoundingClientRect() ?? null
      const expectedBattlefieldSlotIndex = currentBottomBattlefieldRawCards.length

      await runSubmitThenZoneEntryAnimation({
        submitHubIntent,
        intentRequest,
        sourceRect,
        beforeAnimation: () => {
          setBottomBattlefieldDisplayOrder((previousOrder) => {
            const knownIds = new Set(currentBottomBattlefieldRawCards.map((card) => card.instanceId))
            const preservedIds = previousOrder.filter((instanceId) => knownIds.has(instanceId))
            if (preservedIds.includes(cardInstanceId)) {
              return preservedIds
            }

            return [...preservedIds, cardInstanceId]
          })
        },
        resolveDestinationElement: () => {
          const exactCardElement = boardZoneRef.current?.querySelector<HTMLElement>(
            `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${cardInstanceId}"]`,
          ) ?? null
          if (exactCardElement) {
            return exactCardElement
          }

          return boardZoneRef.current?.querySelector<HTMLElement>(
            `[data-zone="character-field-card"][data-slot-side="bottom"][data-slot-index="${expectedBattlefieldSlotIndex}"]`,
          ) ?? null
        },
        timeoutMs: 1800,
        maxFrames: 120,
      })
    })()

    return
  }
  const intentRequest = mapActionToHubIntent(action, canResolvePrompt)
  if (!intentRequest) {
    return
  }

  setPendingSetSupportCardInstanceId(null)
  setPendingCardTargeting(null)
  setPendingSummonTargeting(null)

  void submitHubIntent(intentRequest)
}

interface ISubmitMappedActionArgs {
  action: IGameActionOptionResponse
  canResolvePrompt: boolean
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  getCardActionTargets: (
    request: Omit<IGameCardActionTargetsRequest, 'playerId'>,
  ) => Promise<IGameCardActionTargetsResponse | null>
  characterFieldCards: IGameCardInstanceResponse[]
  setPendingSetSupportCardInstanceId: Dispatch<SetStateAction<string | null>>
  setPendingCardTargeting: Dispatch<SetStateAction<IPendingCardTargetingState | null>>
  setPendingSummonTargeting: Dispatch<SetStateAction<ISummonTargetingState | null>>
  beginBattleTargeting: (targeting: IAttackTargetingState) => void
  beginEffectTargeting: (targeting: IAttackTargetingState) => void
  beginSummonTargeting: (targeting: ISummonTargetingState) => void
  bottomHandRowRef: RefObject<HTMLDivElement | null>
  boardZoneRef: RefObject<HTMLDivElement | null>
  currentBottomBattlefieldRawCards: IGameCardInstanceResponse[]
  setBottomBattlefieldDisplayOrder: Dispatch<SetStateAction<string[]>>
}

export { submitMappedAction }
