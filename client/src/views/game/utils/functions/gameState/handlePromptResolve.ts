import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { IGameCardInstanceResponse } from '@/services/api/types/game'
import type { IGameViewAnimController, IPromptPresentation, ISubmitHubIntentRequest } from '@/views/game/types'
import { HAND_TO_PILE_DURATION_MS, HAND_TO_PILE_STAGGER_MS } from '@/views/game/utils/contants'
import { runHandToPileAnimation, waitMillis } from '@/views/game/utils/functions/animations'

async function handlePromptResolve({
  selectedOption,
  promptPresentation,
  submitHubIntent,
  setIsMulliganAnimationPending,
  bottomHandCards,
  animControllerRef,
  topDeckCardRef,
  bottomDeckCardRef,
  topTrashCardRef,
  bottomTrashCardRef,
  topHandRowRef,
  bottomHandRowRef,
}: IHandlePromptResolveArgs): Promise<void> {
  const isMulliganResolve = promptPresentation?.promptType === 'Mulligan' && selectedOption === 'mulligan'

  // "Choose a card from your hand to place on top of your deck": fly the picked card from the hand to the
  // deck before the server moves it, so the player sees their choice land (same idiom as the mulligan below).
  const isHandCardSelectionResolve =
    promptPresentation?.promptType === 'Effect'
    && promptPresentation.candidateZone === 'Hand'
    && promptPresentation.options.some((option) => option.value === selectedOption)

  if (isHandCardSelectionResolve) {
    void runHandToPileAnimation({
      side: 'bottom',
      destination: 'deck',
      cardInstanceId: selectedOption,
      topDeckCardRef,
      bottomDeckCardRef,
      topTrashCardRef,
      bottomTrashCardRef,
      topHandRowRef,
      bottomHandRowRef,
    })

    await waitMillis(HAND_TO_PILE_DURATION_MS)

    await submitHubIntent({
      intent: 'resolve-prompt',
      selectedOption,
    })
    return
  }

  if (!isMulliganResolve) {
    await submitHubIntent({
      intent: 'resolve-prompt',
      selectedOption,
    })
    return
  }

  setIsMulliganAnimationPending(true)

  const pendingDrawAnimationEndsAt = animControllerRef.current.drawAnimationEndsAt
  if (pendingDrawAnimationEndsAt !== null) {
    const remainingDrawAnimationMs = Math.max(0, pendingDrawAnimationEndsAt - Date.now())
    if (remainingDrawAnimationMs > 0) {
      await waitMillis(remainingDrawAnimationMs)
    }
  }

  const currentBottomHandInstanceIds = bottomHandCards.map((card) => card.instanceId)
  currentBottomHandInstanceIds.forEach((instanceId, index) => {
    const animationTimeoutId = window.setTimeout(() => {
      void runHandToPileAnimation({
        side: 'bottom',
        destination: 'deck',
        cardInstanceId: instanceId,
        topDeckCardRef,
        bottomDeckCardRef,
        topTrashCardRef,
        bottomTrashCardRef,
        topHandRowRef,
        bottomHandRowRef,
      })
    }, index * HAND_TO_PILE_STAGGER_MS)

    animControllerRef.current.pendingDrawTimeoutIds.push(animationTimeoutId)
  })

  const totalHandToPileMs =
    currentBottomHandInstanceIds.length > 0
      ? (currentBottomHandInstanceIds.length - 1) * HAND_TO_PILE_STAGGER_MS + HAND_TO_PILE_DURATION_MS
      : 0

  animControllerRef.current.pendingMulliganDrawReplay = true

  await waitMillis(totalHandToPileMs)

  await submitHubIntent({
    intent: 'resolve-prompt',
    selectedOption,
  })

  setIsMulliganAnimationPending(false)
}

interface IHandlePromptResolveArgs {
  selectedOption: string
  promptPresentation: IPromptPresentation | null
  submitHubIntent: (request: ISubmitHubIntentRequest) => Promise<void>
  setIsMulliganAnimationPending: Dispatch<SetStateAction<boolean>>
  bottomHandCards: IGameCardInstanceResponse[]
  animControllerRef: RefObject<IGameViewAnimController>
  topDeckCardRef: RefObject<HTMLDivElement | null>
  bottomDeckCardRef: RefObject<HTMLDivElement | null>
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
  topHandRowRef: RefObject<HTMLDivElement | null>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
}

export { handlePromptResolve }
