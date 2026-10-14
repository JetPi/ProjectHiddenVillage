import { expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { fetchGameState } from './api'
import { normalizeUserId, resolvePlayerState } from './core'
import { ADVANCE_PHASE_INVALID_STATE_ERROR_CODE, COMPLETE_END_STEP_INVALID_STATE_ERROR_CODE, DECLARE_END_STEP_INVALID_STATE_ERROR_CODE, PHASE_PRESENTATION_PENDING_ERROR_CODE, declarePassInActionStepViaHub, describeHubFailure, tryAdvancePhaseViaHub, tryCompleteEndStepViaHub, tryDeclareEndStepViaHub, waitForNoPendingPresentation } from './hub'
import type { GameStateResponse, MultiplayerPages, MultiplayerSetup, PlayerAuth } from './types'

export async function installAnimationCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const marker = '__phvAnimateCounterInstalled'
    const state = window as unknown as {
      [key: string]: unknown
      __phvAnimateCount?: number
    }

    if (state[marker] === true) {
      return
    }

    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function patchedAnimate(
      keyframes: PropertyIndexedKeyframes | Keyframe[],
      options?: number | KeyframeAnimationOptions,
    ): Animation {
      const currentCount = typeof state.__phvAnimateCount === 'number' ? state.__phvAnimateCount : 0
      state.__phvAnimateCount = currentCount + 1
      return originalAnimate.call(this, keyframes, options)
    }

    state.__phvAnimateCount = 0
    state[marker] = true
  })
}

export async function getAnimationCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const state = window as unknown as { __phvAnimateCount?: number }
    return typeof state.__phvAnimateCount === 'number' ? state.__phvAnimateCount : 0
  })
}

/**
 * Counts how many cards actually travel, and which card each animation was for.
 *
 * A flight marks the element it moves with `data-card-traveling` while it is in the air, and that element is the
 * card itself - there is no second card and no stand-in for it. A rising count therefore proves the movement was
 * drawn instead of the card appearing out of nowhere, which is what every caller of this counter asserts.
 */
export async function installCardFlightCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const marker = '__phvCardGhostCounterInstalled'
    const state = window as unknown as {
      [key: string]: unknown
      __phvCardGhostCount?: number
    }

    if (state[marker] === true) {
      return
    }

    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function patchedAnimate(
      keyframes: PropertyIndexedKeyframes | Keyframe[],
      options?: number | KeyframeAnimationOptions,
    ): Animation {
      if (this instanceof Element && this.getAttribute('data-card-traveling') === 'true') {
        const currentCount = typeof state.__phvCardGhostCount === 'number' ? state.__phvCardGhostCount : 0
        state.__phvCardGhostCount = currentCount + 1

        // The card this animation belongs to, when the element carries it. A count alone cannot tell which card
        // moved, and a cumulative count can be satisfied by an unrelated animation earlier in a scenario.
        const instanceId = this.getAttribute('data-departing-instance-id')
          ?? this.getAttribute('data-card-instance-id')
          ?? this.getAttribute('data-hand-instance-id')
        if (instanceId) {
          const records = Array.isArray(state.__phvCardFlightRecords)
            ? state.__phvCardFlightRecords as Array<{ instanceId: string; at: number }>
            : []
          records.push({ instanceId, at: Math.round(performance.now()) })
          state.__phvCardFlightRecords = records
        }
      }

      return originalAnimate.call(this, keyframes, options)
    }

    state.__phvCardGhostCount = 0
    state.__phvCardFlightRecords = []
    state[marker] = true
  })
}

export async function getCardFlightCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const state = window as unknown as { __phvCardGhostCount?: number }
    return typeof state.__phvCardGhostCount === 'number' ? state.__phvCardGhostCount : 0
  })
}

export type CardFlightRecord = {
  /** The card whose own element moved. */
  instanceId: string
  /** Page-clock time (`performance.now()`, rounded) at which the flight started. */
  at: number
}

/** What has actually been animated since the counter was installed. */
export async function getCardFlightRecords(page: Page): Promise<CardFlightRecord[]> {
  return await page.evaluate(() => {
    const state = window as unknown as { __phvCardFlightRecords?: CardFlightRecord[] }
    return Array.isArray(state.__phvCardFlightRecords) ? state.__phvCardFlightRecords : []
  })
}

/**
 * Cards still marked as flying right now.
 *
 * A settled board must have none: the marker is the flight's own bookkeeping on a live card element, so one
 * left behind means a card was abandoned mid-flight - still transformed, or still hidden by the frame the
 * flight used to avoid flashing at its slot before it started.
 */
export async function countTravelingCardElements(page: Page): Promise<number> {
  return await page.locator('[data-card-traveling="true"]').count()
}

/** Cards still held back waiting for their flight. A settled board must have none (that would be an invisible card). */
export async function countHeldArrivalCardElements(page: Page): Promise<number> {
  return await page.locator('[data-card-arrival-pending="true"]').count()
}

export type HandArrivalFlickerReport = {
  /** Cards seen held back for an arrival flight. Zero means nothing was held, so the other counts prove nothing. */
  heldCards: number
  /** Held cards that were nevertheless painted at their resting spot (the "dealt twice" look). Must be zero. */
  paintedWhileHeld: number
  /** Cards whose slot ran a Motion opacity animation while a flight was moving them. Must be zero. */
  doubleAnimated: number
  /**
   * Cards painted back into a row they had already flown out of. Must be zero: it is the "the old cards show up
   * for a moment before the new ones" artefact (the exit flight restoring a departed card to its resting spot
   * while the state that removes it is still in flight).
   */
  returnedAfterExit: number
  /** The instance ids behind `returnedAfterExit`, so a failure names the cards and not only a count. */
  returnedAfterExitIds: string[]
}

/**
 * Watches every hand card, frame by frame, for the two ways a dealt card can be animated twice.
 *
 * Both are keyed on the *hold* (`data-card-arrival-pending`), which is what marks a card as arriving rather than
 * merely standing in the hand: it is the hold that must keep the card out of sight, and a card that is visibly
 * standing in the hand before its exit flight is normal. So the report asks, of every card that was ever held,
 * whether it was painted while held, and of every card that ever flew, whether Motion was animating its slot at
 * the same time.
 */
export async function installHandArrivalFlickerObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const marker = '__phvHandArrivalFlickerInstalled'
    const state = window as unknown as {
      [key: string]: unknown
      __phvHandArrivalFlickerHeld?: string[]
      __phvHandArrivalFlickerPaintedWhileHeld?: string[]
      __phvHandArrivalFlickerDoubleAnimated?: string[]
      __phvHandArrivalFlickerReturnedAfterExit?: string[]
    }

    if (state[marker] === true) {
      return
    }

    state.__phvHandArrivalFlickerHeld = []
    state.__phvHandArrivalFlickerPaintedWhileHeld = []
    state.__phvHandArrivalFlickerDoubleAnimated = []
    state.__phvHandArrivalFlickerReturnedAfterExit = []

    // Addressed by element, not by id: a card that comes back later is a *new* element, and only the same element
    // being painted again after it flew out is the artefact.
    const travelingElements = new Set<Element>()
    const departedElements = new Map<Element, string>()
    // What a flight *is* has to be read from where it goes, not from the hold: the hold is released in the same
    // task that starts an arrival's flight (so the earliest card of a batch is held for less than a frame), and the
    // fix itself (a departure ending hidden) cannot be the thing the discrimination relies on. Where the flight is
    // on its last airborne frame does the job: an arriving card is coming towards its own row, a departing card is
    // heading for a pile outside it.
    const lastAirborneFrameOutsideRow = new Map<Element, boolean>()

    const offsetByFlight = (element: Element): boolean => {
      const matrix = getComputedStyle(element).transform
      if (!matrix || matrix === 'none') {
        return false
      }

      const numbers = matrix.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? []
      if (numbers.length < 6) {
        return false
      }

      return Math.abs(numbers[4]) > 1 || Math.abs(numbers[5]) > 1
    }

    const hasOpacityAnimation = (element: Element): boolean => {
      return element.getAnimations().some((animation) => {
        const effect = animation.effect as KeyframeEffect | null
        const frames = effect && typeof effect.getKeyframes === 'function' ? effect.getKeyframes() : []
        return frames.some((frame) => Object.prototype.hasOwnProperty.call(frame, 'opacity'))
      })
    }

    let frames = 0

    const tick = () => {
      frames += 1
      if (frames > 4_000) {
        return
      }

      document.querySelectorAll<HTMLElement>('[data-hand-instance-id]').forEach((cardElement) => {
        const instanceId = cardElement.getAttribute('data-hand-instance-id') ?? ''
        if (!instanceId) {
          return
        }

        const held = cardElement.getAttribute('data-card-arrival-pending') === 'true'
        if (held && !state.__phvHandArrivalFlickerHeld?.includes(instanceId)) {
          state.__phvHandArrivalFlickerHeld?.push(instanceId)
        }

        const slot = cardElement.parentElement
        const traveling = cardElement.getAttribute('data-card-traveling') === 'true'
        const visible = getComputedStyle(cardElement).visibility !== 'hidden'
        const opacity = slot ? Number(getComputedStyle(slot).opacity) : 1

        if (traveling) {
          travelingElements.add(cardElement)
          const row = cardElement.closest('[data-testid="bottom-hand-row"],[data-testid="top-hand-row"]')
          if (row) {
            const rowRect = row.getBoundingClientRect()
            const cardRect = cardElement.getBoundingClientRect()
            lastAirborneFrameOutsideRow.set(
              cardElement,
              cardRect.right < rowRect.left
                || cardRect.left > rowRect.right
                || cardRect.bottom < rowRect.top
                || cardRect.top > rowRect.bottom,
            )
          }
        } else if (travelingElements.has(cardElement)) {
          // This element's flight just ended. It was a departure if the card was on its way out of the row.
          travelingElements.delete(cardElement)
          if (lastAirborneFrameOutsideRow.get(cardElement) === true) {
            departedElements.set(cardElement, instanceId)
          }
          lastAirborneFrameOutsideRow.delete(cardElement)
        }

        if (
          departedElements.get(cardElement) === instanceId
          && !traveling
          && !held
          && visible
          && opacity > 0.02
        ) {
          // A card that has left this row must not be painted in it again while the state catches up.
          if (!state.__phvHandArrivalFlickerReturnedAfterExit?.includes(instanceId)) {
            state.__phvHandArrivalFlickerReturnedAfterExit?.push(instanceId)
          }
        }

        if (held && visible && opacity >= 0.5) {
          // The hold is supposed to make the card unpaintable: if it is painted anyway, the card is seen at its
          // resting spot before its flight, which is the artefact this observer exists to prevent.
          if (!state.__phvHandArrivalFlickerPaintedWhileHeld?.includes(instanceId)) {
            state.__phvHandArrivalFlickerPaintedWhileHeld?.push(instanceId)
          }
        }

        if (traveling && slot && hasOpacityAnimation(slot) && !offsetByFlight(slot)) {
          if (!state.__phvHandArrivalFlickerDoubleAnimated?.includes(instanceId)) {
            state.__phvHandArrivalFlickerDoubleAnimated?.push(instanceId)
          }
        }
      })

      window.requestAnimationFrame(tick)
    }

    window.requestAnimationFrame(tick)

    state[marker] = true
  })
}

export async function getHandArrivalFlickerReport(page: Page): Promise<HandArrivalFlickerReport> {
  return await page.evaluate(() => {
    const state = window as unknown as {
      __phvHandArrivalFlickerHeld?: string[]
      __phvHandArrivalFlickerPaintedWhileHeld?: string[]
      __phvHandArrivalFlickerDoubleAnimated?: string[]
      __phvHandArrivalFlickerReturnedAfterExit?: string[]
    }

    return {
      returnedAfterExit: state.__phvHandArrivalFlickerReturnedAfterExit?.length ?? 0,
      returnedAfterExitIds: state.__phvHandArrivalFlickerReturnedAfterExit ?? [],
      heldCards: state.__phvHandArrivalFlickerHeld?.length ?? 0,
      paintedWhileHeld: state.__phvHandArrivalFlickerPaintedWhileHeld?.length ?? 0,
      doubleAnimated: state.__phvHandArrivalFlickerDoubleAnimated?.length ?? 0,
    }
  })
}

/**
 * Counts attack lunges. The lunge is the only board animation that yoyos back to where it started - three
 * keyframes, the first and last both `translate(0px, 0px)` with the middle one displaced - so counting that
 * shape proves the attack resolution was drawn on the board instead of only landing in the phase banner.
 */
export async function installCardLungeCounter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const marker = '__phvCardLungeCounterInstalled'
    const state = window as unknown as {
      [key: string]: unknown
      __phvCardLungeCount?: number
    }

    if (state[marker] === true) {
      return
    }

    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function patchedAnimate(
      keyframes: PropertyIndexedKeyframes | Keyframe[],
      options?: number | KeyframeAnimationOptions,
    ): Animation {
      const frames = Array.isArray(keyframes) ? keyframes : null
      if (frames && frames.length === 3) {
        const firstTransform = String((frames[0] as Keyframe).transform ?? '')
        const middleTransform = String((frames[1] as Keyframe).transform ?? '')
        const lastTransform = String((frames[2] as Keyframe).transform ?? '')

        if (
          firstTransform === 'translate(0px, 0px)'
          && lastTransform === 'translate(0px, 0px)'
          && middleTransform.startsWith('translate(')
        ) {
          const currentCount = typeof state.__phvCardLungeCount === 'number' ? state.__phvCardLungeCount : 0
          state.__phvCardLungeCount = currentCount + 1
        }
      }

      return originalAnimate.call(this, keyframes, options)
    }

    state.__phvCardLungeCount = 0
    state[marker] = true
  })
}

export async function getCardLungeCount(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const state = window as unknown as { __phvCardLungeCount?: number }
    return typeof state.__phvCardLungeCount === 'number' ? state.__phvCardLungeCount : 0
  })
}

/**
 * A point on a bottom-hand card that is safe to press to start a reorder drag.
 *
 * The row deliberately refuses to start a drag from one of the hover overlay's controls (so the card's buttons
 * keep working), which makes a press at the card's centre a coin flip: hover the card, and the control may be
 * under the cursor. This walks a grid of candidate points and returns the first that is inside the card and not
 * covered by a control.
 *
 * Call it *after* hovering the card, so the overlay is in the state the press will actually see.
 */
export async function resolveHandCardDragPressPoint(
  page: Page,
  cardInstanceId: string,
): Promise<{ x: number; y: number } | null> {
  return await page.evaluate((instanceId) => {
    const card = document.querySelector<HTMLElement>(`[data-hand-instance-id="${instanceId}"]`)
    if (!card) {
      return null
    }

    const box = card.getBoundingClientRect()
    for (const horizontalRatio of [0.5, 0.35, 0.65, 0.2, 0.8, 0.12, 0.88]) {
      for (const verticalRatio of [0.25, 0.4, 0.6, 0.75, 0.15, 0.88]) {
        const x = box.left + box.width * horizontalRatio
        const y = box.top + box.height * verticalRatio
        const element = document.elementFromPoint(x, y)
        if (!element || (element !== card && !card.contains(element))) {
          continue
        }

        if (element.closest('button,[role="button"],[data-prevent-hand-drag="true"]')) {
          continue
        }

        return { x, y }
      }
    }

    return null
  }, cardInstanceId)
}

export async function getBottomBattlefieldInstanceOrder(page: Page): Promise<string[]> {
  return await page
    .locator('[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id]')
    .evaluateAll((nodes) => {
      return nodes
        .map((node) => node.getAttribute('data-card-instance-id'))
        .filter((value): value is string => Boolean(value))
    })
}

export async function getBottomSupportCardsBySlot(page: Page): Promise<Array<{ slotIndex: number; instanceId: string }>> {
  return await page
    .locator('[data-zone="support"][data-slot-side="bottom"][data-card-instance-id]')
    .evaluateAll((nodes) => {
      return nodes
        .map((node) => {
          const slotIndexRaw = node.getAttribute('data-slot-index')
          const instanceId = node.getAttribute('data-card-instance-id')
          return {
            slotIndex: slotIndexRaw ? Number.parseInt(slotIndexRaw, 10) : Number.NaN,
            instanceId,
          }
        })
        .filter((entry): entry is { slotIndex: number; instanceId: string } => {
          return Number.isInteger(entry.slotIndex) && entry.instanceId !== null
        })
    })
}

function resolveActivePlayerFromStates(setup: MultiplayerSetup, playerOneState: GameStateResponse): PlayerAuth {
  return normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
    ? setup.playerOne
    : setup.playerTwo
}

export async function progressToNextDecisionWindow(
  setup: MultiplayerSetup,
  playerOneState: GameStateResponse,
  playerTwoState: GameStateResponse,
): Promise<'progressed' | 'waiting'> {
  const activePlayer = resolveActivePlayerFromStates(setup, playerOneState)
  const activePlayerState = activePlayer.userId === setup.playerOne.userId ? playerOneState : playerTwoState

  // The engine now walks the non-interactive phases itself and holds the table on each transition until the
  // boards have acknowledged it; the hub therefore refuses every other mutation in the meantime. Those
  // acknowledgements belong to the pages, so an API-driven helper waits the gate out (and its own calls below
  // still absorb a gate that closed again in the middle of the window).
  await waitForNoPendingPresentation(setup.gameCode, activePlayer)

  const canEndTurn = activePlayerState.availableActions.some((action) => action.actionId === 'turn-end' && action.isEnabled)
  if (canEndTurn) {
    // Read-then-act race: the state above is a snapshot, so either end-step call can be rejected by
    // the server once the phase has already moved (e.g. it auto-completed the end step). Absorb the
    // invalid-state rejections and report 'waiting' so the caller re-reads instead of failing.
    const declareResult = await tryDeclareEndStepViaHub(setup.gameCode, activePlayer)
    if (!declareResult.succeeded
      && declareResult.errorCode !== DECLARE_END_STEP_INVALID_STATE_ERROR_CODE
      && declareResult.errorCode !== PHASE_PRESENTATION_PENDING_ERROR_CODE) {
      throw new Error(describeHubFailure('Hub.DeclareEndStep', declareResult))
    }

    const completeResult = await tryCompleteEndStepViaHub(setup.gameCode, activePlayer)
    if (!completeResult.succeeded) {
      if (completeResult.errorCode === COMPLETE_END_STEP_INVALID_STATE_ERROR_CODE
        || completeResult.errorCode === PHASE_PRESENTATION_PENDING_ERROR_CODE) {
        return 'waiting'
      }

      throw new Error(describeHubFailure('Hub.CompleteEndStep', completeResult))
    }

    await new Promise((resolve) => setTimeout(resolve, 300))
    return 'progressed'
  }

  const playerOneCanPass = playerOneState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
  if (playerOneCanPass) {
    await declarePassInActionStepViaHub(setup.gameCode, setup.playerOne)
    await new Promise((resolve) => setTimeout(resolve, 300))
    return 'progressed'
  }

  const playerTwoCanPass = playerTwoState.availableActions.some((action) => action.actionId === 'pass-turn' && action.isEnabled)
  if (playerTwoCanPass) {
    await declarePassInActionStepViaHub(setup.gameCode, setup.playerTwo)
    await new Promise((resolve) => setTimeout(resolve, 300))
    return 'progressed'
  }

  const canAdvance = activePlayerState.availableActions.some((action) => action.actionId === 'advance-phase' && action.isEnabled)
  if (!canAdvance) {
    // With the phase automation on there is no system action left to take: the engine is either still walking
    // (the gate above clears) or a prompt owns the board. Either way the caller re-reads the state.
    await new Promise((resolve) => setTimeout(resolve, 350))
    return 'waiting'
  }

  const advanceResult = await tryAdvancePhaseViaHub(setup.gameCode, activePlayer)
  if (!advanceResult.succeeded) {
    // Read-then-act race: someone else advanced the phase, or a prompt appeared, after the state
    // read above. The server rejected our advance — report 'waiting' (never 'progressed') so the
    // caller re-reads the state instead of failing.
    if (advanceResult.errorCode === ADVANCE_PHASE_INVALID_STATE_ERROR_CODE
      || advanceResult.errorCode === PHASE_PRESENTATION_PENDING_ERROR_CODE) {
      return 'waiting'
    }

    throw new Error(describeHubFailure('Hub.AdvancePhase', advanceResult))
  }

  await new Promise((resolve) => setTimeout(resolve, 300))
  return 'progressed'
}

export async function resolveActorWithBottomHandAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actionLabel: 'Summon' | 'Set Support' | 'Support',
  options?: {
    actorUserId?: string
    cardDefinitionId?: string
  },
): Promise<{ actor: PlayerAuth; actorPage: Page; cardInstanceId: string; actionId: string }> {
  const maxCycles = 180
  const actionPrefix = actionLabel === 'Summon'
    ? 'summon-to-field:'
    : actionLabel === 'Support'
      ? 'activate-support:'
      : 'set-support:'
  const normalizedLabel = actionLabel.trim().toLowerCase()
  const normalizedRequestedActorUserId = options?.actorUserId?.trim().toLowerCase() ?? ''
  const normalizedRequestedCardDefinitionId = options?.cardDefinitionId?.trim().toLowerCase() ?? ''

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    // A finished game can never satisfy the search (no action is published at all), so fail fast with the
    // reason instead of walking phases until the cycle budget runs out.
    if (playerOneState.gameOutcome) {
      throw new Error(
        `The game ended (${playerOneState.gameOutcome.reason}) before a '${actionLabel}' action`
        + `${normalizedRequestedCardDefinitionId.length > 0 ? ` for card definition '${normalizedRequestedCardDefinitionId}'` : ''} could be found.`,
      )
    }

    const resolveHandActionFromState = (state: GameStateResponse, actor: PlayerAuth) => {
      const actorState = resolvePlayerState(state, actor)
      for (const handCard of actorState.hand) {
        if (
          normalizedRequestedCardDefinitionId.length > 0
          && handCard.cardDefinitionId?.trim().toLowerCase() !== normalizedRequestedCardDefinitionId
        ) {
          continue
        }

        const availableActions = handCard.availableActions ?? []
        const matchedAction = availableActions.find((action) => {
          return action.isEnabled && action.label.trim().toLowerCase() === normalizedLabel
        })

        if (matchedAction) {
          return {
            cardInstanceId: handCard.instanceId,
            actionId: matchedAction.actionId,
          }
        }
      }

      return null
    }

    const playerOneCanUseHandActions =
      (normalizedRequestedActorUserId.length === 0 || setup.playerOne.userId.trim().toLowerCase() === normalizedRequestedActorUserId)
      &&
      playerOneState.phase === 'MainPhase'
      && playerOneState.pendingPrompt === null
      && normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
    if (playerOneCanUseHandActions) {
      const resolvedAction = resolveHandActionFromState(playerOneState, setup.playerOne)
      if (resolvedAction) {
        return {
          actor: setup.playerOne,
          actorPage: pages.playerOnePage,
          cardInstanceId: resolvedAction.cardInstanceId,
          actionId: resolvedAction.actionId || `${actionPrefix}${resolvedAction.cardInstanceId}`,
        }
      }
    }

    const playerTwoCanUseHandActions =
      (normalizedRequestedActorUserId.length === 0 || setup.playerTwo.userId.trim().toLowerCase() === normalizedRequestedActorUserId)
      &&
      playerTwoState.phase === 'MainPhase'
      && playerTwoState.pendingPrompt === null
      && normalizeUserId(playerTwoState.activePlayerId) === setup.playerTwo.normalizedUserId
    if (playerTwoCanUseHandActions) {
      const resolvedAction = resolveHandActionFromState(playerTwoState, setup.playerTwo)
      if (resolvedAction) {
        return {
          actor: setup.playerTwo,
          actorPage: pages.playerTwoPage,
          cardInstanceId: resolvedAction.cardInstanceId,
          actionId: resolvedAction.actionId || `${actionPrefix}${resolvedAction.cardInstanceId}`,
        }
      }
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  const filterSuffix = normalizedRequestedCardDefinitionId.length > 0
    ? ` for card definition '${normalizedRequestedCardDefinitionId}'`
    : ''
  throw new Error(`No '${actionLabel}' action found in bottom hand${filterSuffix} after deterministic phase advancement.`)
}

export async function resolvePlayerHandActionWithoutReload(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  player: PlayerAuth,
): Promise<{ cardInstanceId: string; actionLabel: string }> {
  const maxCycles = 180

  const resolveHandActionFromState = (state: GameStateResponse, actor: PlayerAuth) => {
    const actorState = resolvePlayerState(state, actor)

    for (const handCard of actorState.hand) {
      const availableActions = handCard.availableActions ?? []
      const matchedAction = availableActions.find((action) => {
        const normalizedLabel = action.label.trim().toLowerCase()
        return action.isEnabled && (normalizedLabel === 'summon' || normalizedLabel === 'set support')
      })

      if (matchedAction) {
        return {
          cardInstanceId: handCard.instanceId,
          actionLabel: matchedAction.label,
        }
      }
    }

    return null
  }

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const targetState = player.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const targetPlayerCanUseHandActions =
      targetState.phase === 'MainPhase'
      && targetState.pendingPrompt === null
      && normalizeUserId(targetState.activePlayerId) === player.normalizedUserId

    if (targetPlayerCanUseHandActions) {
      const resolvedAction = resolveHandActionFromState(targetState, player)
      if (resolvedAction) {
        return resolvedAction
      }
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error(`No enabled bottom-hand Summon/Set Support action found for player '${player.userId}' within retry limit.`)
}

export async function resolveActorWithBottomBattleAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<{ actor: PlayerAuth; actorPage: Page; cardInstanceId: string; actionLabel: string; actionId: string }> {
  const maxCycles = 180

  const resolveBattleActionFromState = (state: GameStateResponse, actor: PlayerAuth) => {
    const actorState = resolvePlayerState(state, actor)
    for (const battleCard of actorState.characterField) {
      const availableActions = battleCard.availableActions ?? []
      const matchedAction = availableActions.find((action) => {
        return action.isEnabled && action.label.trim().toLowerCase() === 'battle'
      })

      if (matchedAction) {
        return {
          cardInstanceId: battleCard.instanceId,
          actionLabel: matchedAction.label,
          actionId: matchedAction.actionId,
        }
      }
    }

    return null
  }

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const activePlayer = resolveActivePlayerFromStates(setup, playerOneState)
    const activePlayerState = activePlayer.userId === setup.playerOne.userId ? playerOneState : playerTwoState

    if (activePlayerState.phase === 'MainPhase' && activePlayerState.pendingPrompt === null) {
      const resolvedAction = activePlayer.userId === setup.playerOne.userId
        ? resolveBattleActionFromState(playerOneState, setup.playerOne)
        : resolveBattleActionFromState(playerTwoState, setup.playerTwo)

      if (resolvedAction) {
        return {
          actor: activePlayer,
          actorPage: activePlayer.userId === setup.playerOne.userId ? pages.playerOnePage : pages.playerTwoPage,
          cardInstanceId: resolvedAction.cardInstanceId,
          actionLabel: resolvedAction.actionLabel,
          actionId: resolvedAction.actionId,
        }
      }
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error('No enabled battlefield Battle action was found within retry limit.')
}

export async function resolveActorWithLeaderBattleAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
): Promise<{ actor: PlayerAuth; actorPage: Page; leaderInstanceId: string; actionLabel: string; actionId: string }> {
  const maxCycles = 180

  const resolveLeaderBattleActionFromState = (state: GameStateResponse, actor: PlayerAuth) => {
    const actorState = resolvePlayerState(state, actor)
    const leader = actorState.leader
    const matchedAction = (leader.availableActions ?? []).find((action) => {
      return action.isEnabled && action.label.trim().toLowerCase() === 'battle'
    })

    if (!matchedAction) {
      return null
    }

    return {
      leaderInstanceId: leader.instanceId ?? '',
      actionLabel: matchedAction.label,
      actionId: matchedAction.actionId,
    }
  }

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const activePlayer = resolveActivePlayerFromStates(setup, playerOneState)
    const activePlayerState = activePlayer.userId === setup.playerOne.userId ? playerOneState : playerTwoState

    if (activePlayerState.phase === 'MainPhase' && activePlayerState.pendingPrompt === null) {
      const resolvedAction = resolveLeaderBattleActionFromState(activePlayerState, activePlayer)
      if (resolvedAction) {
        return {
          actor: activePlayer,
          actorPage: activePlayer.userId === setup.playerOne.userId ? pages.playerOnePage : pages.playerTwoPage,
          leaderInstanceId: resolvedAction.leaderInstanceId,
          actionLabel: resolvedAction.actionLabel,
          actionId: resolvedAction.actionId,
        }
      }
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error('No enabled leader Battle action was found within retry limit.')
}

export type DeckRevealObservation = {
  revealed: boolean
  definitionId: string | null
  /** Page-clock timestamp (`performance.now()`), comparable with the battlefield entry recordings. */
  at: number
}

/**
 * Records every face-up / face-down change of the acting player's deck slot. A reveal presentation only lasts
 * `REVEAL_PRESENTATION_MS` (2 s) before the client acknowledges it, so a test that starts polling *after* the
 * action was submitted can miss the flip entirely - observing in the page catches it however briefly it shows.
 */
export async function installDeckRevealObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const marker = '__phvDeckRevealObserverInstalled'
    const state = window as unknown as {
      [key: string]: unknown
      __phvDeckReveals?: Array<{ revealed: boolean; definitionId: string | null; at: number }>
    }

    if (state[marker] === true) {
      return
    }

    const record = () => {
      const pile = document.querySelector('[data-side="bottom"] [data-testid="deck-pile-card"]')
      if (!pile) {
        return
      }

      const revealed = pile.getAttribute('data-revealed') === 'true'
      const definitionId = pile.getAttribute('data-card-definition-id')
      const entries = state.__phvDeckReveals ?? []
      const last = entries[entries.length - 1]

      // Only recorded when the state actually changed, so re-renders do not fill the list with duplicates.
      if (last && last.revealed === revealed && last.definitionId === definitionId) {
        return
      }

      entries.push({
        revealed,
        definitionId,
        at: Math.round(performance.now()),
      })
      state.__phvDeckReveals = entries
    }

    const observer = new MutationObserver(record)
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-revealed', 'data-card-definition-id'],
    })

    state.__phvDeckReveals = []
    record()
    state[marker] = true
  })
}

export async function getDeckRevealObservations(page: Page): Promise<DeckRevealObservation[]> {
  return await page.evaluate(() => {
    const state = window as unknown as {
      __phvDeckReveals?: Array<{ revealed: boolean; definitionId: string | null; at: number }>
    }
    return state.__phvDeckReveals ?? []
  })
}

/**
 * Samples the acting player's trash pile slot every animation frame. The pile slots are lane-sized
 * (`h-full` + `aspect-[200/277]`), but a destination-side flight animation un-clips their ancestors for its
 * length, which used to blow the whole pile grid out to the card art's min-content box (~78×108 -> ~100×274) -
 * a "massive card" flash that lasts only as long as the flight, so polling after the action settled misses it.
 */
export async function installPileSlotGeometryObserver(page: Page, side: 'top' | 'bottom' = 'bottom'): Promise<void> {
  await page.evaluate((observedSide) => {
    const marker = '__phvPileSlotObserverInstalled'
    const state = window as unknown as {
      [key: string]: unknown
      __phvPileSlotSamples?: Array<{ width: number; height: number; at: number }>
    }

    if (state[marker] === true) {
      return
    }

    const samples: Array<{ width: number; height: number; at: number }> = []
    state.__phvPileSlotSamples = samples
    let frames = 0

    const tick = () => {
      const slot = document.querySelector(`[data-side="${observedSide}"] [data-testid="trash-pile-card"]`)
      if (slot) {
        const rect = slot.getBoundingClientRect()
        samples.push({
          width: Number(rect.width.toFixed(1)),
          height: Number(rect.height.toFixed(1)),
          at: Math.round(performance.now()),
        })
      }

      frames += 1
      // Bounded: the loop covers the action under test (~15 s) without running for the rest of the page's life.
      if (frames < 900) {
        window.requestAnimationFrame(tick)
      }
    }

    state[marker] = true
    tick()
  }, side)
}

export async function getPileSlotGeometrySamples(page: Page): Promise<PileSlotGeometrySample[]> {
  return await page.evaluate(() => {
    const state = window as unknown as {
      __phvPileSlotSamples?: Array<{ width: number; height: number; at: number }>
    }
    return state.__phvPileSlotSamples ?? []
  })
}

export type PileSlotGeometrySample = {
  width: number
  height: number
  /** Page-clock timestamp (`performance.now()`). */
  at: number
}

/**
 * Records the entry animations of character-field cards. The card that flies is the card itself, marked with
 * `data-card-traveling` while it is in the air, and its first keyframe is offset from where it came from - so a
 * recorded frame whose start transform is offset proves the card FLEW into its slot (a reveal-summon out of the
 * deck, a hand summon) instead of simply appearing there.
 */
export async function installBattlefieldEntryAnimationRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const marker = '__phvBattlefieldEntryRecorderInstalled'
    const state = window as unknown as {
      [key: string]: unknown
      __phvBattlefieldEntryAnimations?: Array<{ instanceId: string; fromTransform: string; at: number }>
    }

    if (state[marker] === true) {
      return
    }

    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function patchedAnimate(
      keyframes: PropertyIndexedKeyframes | Keyframe[],
      options?: number | KeyframeAnimationOptions,
    ): Animation {
      const target = this instanceof Element ? this : null
      const isBattlefieldCard = target?.getAttribute('data-zone') === 'character-field-card'
      const isTravelingCard = target?.getAttribute('data-card-traveling') === 'true'
      if (target && (isBattlefieldCard || isTravelingCard)) {
        const firstKeyframe = Array.isArray(keyframes) ? keyframes[0] : keyframes
        const fromTransform =
          firstKeyframe && typeof firstKeyframe === 'object'
            ? String((firstKeyframe as Keyframe).transform ?? '')
            : ''
        const recorded = state.__phvBattlefieldEntryAnimations ?? []
        recorded.push({
          instanceId: target.getAttribute('data-card-instance-id') ?? '',
          fromTransform,
          at: Math.round(performance.now()),
        })
        state.__phvBattlefieldEntryAnimations = recorded
      }

      return originalAnimate.call(this, keyframes, options)
    }

    state.__phvBattlefieldEntryAnimations = []
    state[marker] = true
  })
}

export async function getBattlefieldEntryAnimations(
  page: Page,
): Promise<Array<{ instanceId: string; fromTransform: string; at: number }>> {
  return await page.evaluate(() => {
    const state = window as unknown as {
      __phvBattlefieldEntryAnimations?: Array<{ instanceId: string; fromTransform: string; at: number }>
    }
    return state.__phvBattlefieldEntryAnimations ?? []
  })
}

/**
 * Resolves an enabled leader effect (`leader-effect:{instanceId}:{effectKey}`) for the requested actor. Leader
 * effects are published on the leader card, never in the global action list, and [Activate: Main] ones need the
 * actor's own MainPhase with no prompt pending - so this advances turns until that window arrives.
 */
export async function resolveActorWithLeaderEffectAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  options: { actorUserId?: string; effectKey: string },
): Promise<{ actor: PlayerAuth; actorPage: Page; leaderInstanceId: string; actionId: string }> {
  const maxCycles = 180
  const normalizedRequestedActorUserId = options.actorUserId?.trim().toLowerCase() ?? ''
  const actionSuffix = `:${options.effectKey}`

  const resolveLeaderActionFromState = (state: GameStateResponse, actor: PlayerAuth) => {
    const actorState = resolvePlayerState(state, actor)
    const leaderInstanceId = actorState.leader.instanceId ?? ''
    const matchedAction = (actorState.leader.availableActions ?? []).find((action) => {
      return action.isEnabled
        && action.actionId.startsWith('leader-effect:')
        && action.actionId.endsWith(actionSuffix)
    })

    if (!matchedAction || !leaderInstanceId) {
      return null
    }

    return { leaderInstanceId, actionId: matchedAction.actionId }
  }

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const candidates = [
      { actor: setup.playerOne, state: playerOneState, page: pages.playerOnePage },
      { actor: setup.playerTwo, state: playerTwoState, page: pages.playerTwoPage },
    ]

    for (const candidate of candidates) {
      const matchesActor = normalizedRequestedActorUserId.length === 0
        || candidate.actor.userId.trim().toLowerCase() === normalizedRequestedActorUserId
      const canActivate = candidate.state.phase === 'MainPhase'
        && candidate.state.pendingPrompt === null
        && normalizeUserId(candidate.state.activePlayerId) === candidate.actor.normalizedUserId

      if (!matchesActor || !canActivate) {
        continue
      }

      const resolvedAction = resolveLeaderActionFromState(candidate.state, candidate.actor)
      if (resolvedAction) {
        return {
          actor: candidate.actor,
          actorPage: candidate.page,
          leaderInstanceId: resolvedAction.leaderInstanceId,
          actionId: resolvedAction.actionId,
        }
      }
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error(`No enabled leader effect '${options.effectKey}' action was found within retry limit.`)
}

export async function resolveBattleActionForSpecificCard(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actor: PlayerAuth,
  cardInstanceId: string,
): Promise<{ actor: PlayerAuth; actorPage: Page; cardInstanceId: string; actionLabel: string; actionId: string }> {
  const maxCycles = 180

  const resolveSpecificBattleActionFromState = (state: GameStateResponse) => {
    const actorState = resolvePlayerState(state, actor)
    const actorCard = actorState.characterField.find((card) => card.instanceId === cardInstanceId)
    if (!actorCard) {
      return null
    }

    const matchedAction = (actorCard.availableActions ?? []).find((action) => {
      return action.isEnabled && action.label.trim().toLowerCase() === 'battle'
    })

    if (!matchedAction) {
      return null
    }

    return {
      cardInstanceId,
      actionLabel: matchedAction.label,
      actionId: matchedAction.actionId,
    }
  }

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const actorState = actor.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const resolvedAction = resolveSpecificBattleActionFromState(actorState)
    if (resolvedAction) {
      return {
        actor,
        actorPage: actor.userId === setup.playerOne.userId ? pages.playerOnePage : pages.playerTwoPage,
        cardInstanceId: resolvedAction.cardInstanceId,
        actionLabel: resolvedAction.actionLabel,
        actionId: resolvedAction.actionId,
      }
    }

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error(`No enabled Battle action was found for card '${cardInstanceId}' within retry limit.`)
}

export type PhaseRowSample = {
  /** The phase banner's text, e.g. the turn the board is showing. */
  phaseText: string
  /** Every action chip painted in the phase row at that frame, in order. */
  chipTexts: string[]
  /** Page-clock timestamp (`performance.now()`). */
  at: number
}

/**
 * Samples the phase row (the banner plus its action chips) every animation frame.
 *
 * A system `advance-phase` chip - if the HUD ever drew one - would only live for the few hundred
 * milliseconds between the state push and the auto-advance signal, and the row's content is what changes
 * across a transition, so a test that starts polling after the turn was ended can miss the whole window.
 * Per-frame sampling records every intermediate state however briefly it shows, including the frames that
 * prove the chips were held while the phase moved on.
 */
export async function installPhaseRowSampler(page: Page, maxFrames = 3_600): Promise<void> {
  await page.evaluate((frameBudget) => {
    const marker = '__phvPhaseRowSamplerInstalled'
    const state = window as unknown as {
      [key: string]: unknown
      __phvPhaseRowSamples?: Array<{ phaseText: string; chipTexts: string[]; at: number }>
    }

    if (state[marker] === true) {
      return
    }

    state.__phvPhaseRowSamples = []
    let frames = 0

    const tick = () => {
      const indicator = document.querySelector('[data-testid="phase-indicator"]')
      if (indicator) {
        const row = indicator.parentElement
        const chipTexts = row
          ? Array.from(row.querySelectorAll('button')).map((button) => (button.textContent ?? '').trim())
          : []

        state.__phvPhaseRowSamples?.push({
          phaseText: (indicator.textContent ?? '').trim(),
          chipTexts,
          at: Math.round(performance.now()),
        })
      }

      frames += 1
      if (frames < frameBudget) {
        window.requestAnimationFrame(tick)
      }
    }

    state[marker] = true
    tick()
  }, maxFrames)
}

/** Stamps the page clock, so a caller can slice the samples recorded after this point. */
export async function markPhaseRowSampleTime(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const state = window as unknown as { __phvPhaseRowMarkTime?: number }
    const mark = Math.round(performance.now())
    state.__phvPhaseRowMarkTime = mark
    return mark
  })
}

export async function getPhaseRowSamples(page: Page): Promise<PhaseRowSample[]> {
  return await page.evaluate(() => {
    const state = window as unknown as {
      __phvPhaseRowSamples?: Array<{ phaseText: string; chipTexts: string[]; at: number }>
    }
    return state.__phvPhaseRowSamples ?? []
  })
}

/**
 * Waits for the actor's `turnIndex`-th MainPhase *entry* since the call started, driving the game forward
 * with `progressToNextDecisionWindow` while it waits. A window the actor is already inside counts as entry
 * 1, so `turnIndex: 2` means "the actor's next MainPhase after this one" and `turnIndex: 1` means "the
 * actor's next MainPhase, which may be the one they are already in".
 *
 * Turn-scoped rules read the active player's `TurnCount`, which the client payload does not expose:
 * "neither player can attack on their first turn" (`BattleAction.FirstTurn`) hides a Rush keyword until
 * the owner's *second* turn, so a spec that asserts "this card may attack the turn it was summoned" has
 * to know how many of the actor's own turns have already passed.
 */
export async function waitForActorMainPhaseNumber(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  actor: PlayerAuth,
  turnIndex: number,
): Promise<void> {
  let observedEntryCount = 0
  let isInsideMainPhase = false

  for (let cycle = 0; cycle < 240; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const actorState = actor.userId === setup.playerOne.userId ? playerOneState : playerTwoState
    const isActorMainPhase = actorState.phase === 'MainPhase'
      && actorState.pendingPrompt === null
      && normalizeUserId(actorState.activePlayerId) === actor.normalizedUserId

    if (isActorMainPhase && !isInsideMainPhase) {
      observedEntryCount += 1
      if (observedEntryCount >= turnIndex) {
        return
      }
    }

    isInsideMainPhase = isActorMainPhase

    await progressToNextDecisionWindow(setup, playerOneState, playerTwoState)
  }

  throw new Error(`The actor never reached main phase entry ${turnIndex} within the search window.`)
}
