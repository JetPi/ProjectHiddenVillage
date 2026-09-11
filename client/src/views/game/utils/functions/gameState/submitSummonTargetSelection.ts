import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { IGameCardInstanceResponse } from '@/services/api/types/game'
import type { IGameViewAnimController, ISubmitHubIntentRequest, ISummonTargetingState } from '@/views/game/types'
import { HAND_TO_PILE_STAGGER_MS } from '@/views/game/utils/contants'
import { runCardImageGhostToElementAnimation } from '@/views/game/utils/functions/animations'
import { canConfirmSummonTargetSelection } from './canConfirmSummonTargetSelection'
import { runSubmitThenZoneEntryAnimation } from './runSubmitThenZoneEntryAnimation'

function submitSummonTargetSelection({
  pendingSummonTargeting,
  setPendingSummonTargeting,
  submitHubIntent,
  animControllerRef,
  bottomHandRowRef,
  boardZoneRef,
  topTrashCardRef,
  bottomTrashCardRef,
  currentBottomBattlefieldRawCards,
  setBottomBattlefieldDisplayOrder,
}: ISubmitSummonTargetSelectionArgs): void {
  if (!pendingSummonTargeting || !canConfirmSummonTargetSelection(pendingSummonTargeting)) {
    return
  }

  const sourceCardInstanceId = pendingSummonTargeting.sourceCardInstanceId
  const sourceCardElement = bottomHandRowRef.current?.querySelector<HTMLDivElement>(
    `[data-hand-instance-id="${sourceCardInstanceId}"]`,
  ) ?? null
  const sourceRect = sourceCardElement?.getBoundingClientRect() ?? null
  const expectedBattlefieldSlotIndex = currentBottomBattlefieldRawCards.length
  const intentRequest: ISubmitHubIntentRequest = {
    intent: 'execute-card-action',
    actionId: pendingSummonTargeting.actionId,
    sourceCardInstanceId,
    selectedTargets: pendingSummonTargeting.selectedTargets,
  }

  const tributeGhostSources = captureTributeGhostSources(pendingSummonTargeting.selectedTargets, boardZoneRef)

  setPendingSummonTargeting(null)

  void (async () => {
    await runSubmitThenZoneEntryAnimation({
      submitHubIntent,
      intentRequest,
      sourceRect,
      beforeAnimation: () => {
        setBottomBattlefieldDisplayOrder((previousOrder) => {
          const knownIds = new Set(currentBottomBattlefieldRawCards.map((card) => card.instanceId))
          const preservedIds = previousOrder.filter((instanceId) => knownIds.has(instanceId))
          if (preservedIds.includes(sourceCardInstanceId)) {
            return preservedIds
          }

          return [...preservedIds, sourceCardInstanceId]
        })
      },
      resolveDestinationElement: () => {
        const exactCardElement = boardZoneRef.current?.querySelector<HTMLElement>(
          `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${sourceCardInstanceId}"]`,
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

  scheduleCardGhostAnimations({
    ghostSources: tributeGhostSources,
    topTrashCardRef,
    bottomTrashCardRef,
    animControllerRef,
  })
}

interface ISubmitSummonTargetSelectionArgs {
  pendingSummonTargeting: ISummonTargetingState | null
  setPendingSummonTargeting: Dispatch<SetStateAction<ISummonTargetingState | null>>
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  animControllerRef: RefObject<IGameViewAnimController>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
  boardZoneRef: RefObject<HTMLDivElement | null>
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
  currentBottomBattlefieldRawCards: IGameCardInstanceResponse[]
  setBottomBattlefieldDisplayOrder: Dispatch<SetStateAction<string[]>>
}

/**
 * Captures, before the summon is submitted, the art and on-screen rectangle of each tribute card so
 * the card can visually fly to the trash afterwards without moving (or mutating) the real elements.
 */
function captureTributeGhostSources(
  tributeTargets: ISummonTargetingState['selectedTargets'],
  boardZoneRef: RefObject<HTMLDivElement | null>,
): ICardGhostSource[] {
  const boardElement = boardZoneRef.current
  if (!boardElement) {
    return []
  }

  const ghostSources: ICardGhostSource[] = []
  for (const target of tributeTargets) {
    const cardElement = boardElement.querySelector<HTMLElement>(
      `[data-zone="character-field-card"][data-card-instance-id="${target.cardInstanceId}"]`,
    )
    const imageElement = cardElement?.querySelector<HTMLImageElement>('img') ?? null
    if (!cardElement || !imageElement) {
      continue
    }

    ghostSources.push({
      imageSrc: imageElement.currentSrc || imageElement.src,
      sourceRect: cardElement.getBoundingClientRect(),
      side: cardElement.getAttribute('data-slot-side') === 'top' ? 'top' : 'bottom',
    })
  }

  return ghostSources
}

function scheduleCardGhostAnimations({
  ghostSources,
  topTrashCardRef,
  bottomTrashCardRef,
  animControllerRef,
}: IScheduleCardGhostAnimationsArgs): void {
  ghostSources.forEach((ghostSource, index) => {
    const animationTimeoutId = window.setTimeout(() => {
      void runCardImageGhostToElementAnimation({
        imageSrc: ghostSource.imageSrc,
        sourceRect: ghostSource.sourceRect,
        destinationElement: ghostSource.side === 'top' ? topTrashCardRef.current : bottomTrashCardRef.current,
      })
    }, index * HAND_TO_PILE_STAGGER_MS)

    animControllerRef.current.pendingDrawTimeoutIds.push(animationTimeoutId)
  })
}

interface ICardGhostSource {
  imageSrc: string
  sourceRect: DOMRect
  side: 'top' | 'bottom'
}

interface IScheduleCardGhostAnimationsArgs {
  ghostSources: ICardGhostSource[]
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
  animControllerRef: RefObject<IGameViewAnimController>
}

export { submitSummonTargetSelection }
