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

  if (!isMulliganResolve) {
    await submitHubIntent({
      intent: 'resolve-prompt',
      selectedOption,
    })
    return
  }

  setIsMulliganAnimationPending(true)

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
