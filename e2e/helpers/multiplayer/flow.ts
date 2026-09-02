import { expect } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'
import { fetchGameState } from './api'
import { normalizeUserId, resolvePlayerState } from './core'
import { advancePhaseViaHub, completeEndStepViaHub, declareEndStepViaHub, declarePassInActionStepViaHub } from './hub'
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

async function progressToNextDecisionWindow(
  setup: MultiplayerSetup,
  playerOneState: GameStateResponse,
  playerTwoState: GameStateResponse,
): Promise<'progressed' | 'waiting'> {
  const activePlayer = resolveActivePlayerFromStates(setup, playerOneState)
  const activePlayerState = activePlayer.userId === setup.playerOne.userId ? playerOneState : playerTwoState

  const canEndTurn = activePlayerState.availableActions.some((action) => action.actionId === 'turn-end' && action.isEnabled)
  if (canEndTurn) {
    await declareEndStepViaHub(setup.gameCode, activePlayer)
    await completeEndStepViaHub(setup.gameCode, activePlayer)
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
    await new Promise((resolve) => setTimeout(resolve, 350))
    return 'waiting'
  }

  await advancePhaseViaHub(setup.gameCode, activePlayer)
  await new Promise((resolve) => setTimeout(resolve, 300))
  return 'progressed'
}

export async function resolveActorWithBottomHandAction(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  pages: MultiplayerPages,
  actionLabel: 'Summon' | 'Set Support',
): Promise<{ actor: PlayerAuth; actorPage: Page; cardInstanceId: string; actionId: string }> {
  const maxCycles = 180
  const actionPrefix = actionLabel === 'Summon' ? 'summon-to-field:' : 'set-support:'
  const normalizedLabel = actionLabel.trim().toLowerCase()

  for (let cycle = 0; cycle < maxCycles; cycle += 1) {
    const [playerOneState, playerTwoState] = await Promise.all([
      fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
      fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
    ])

    const resolveHandActionFromState = (state: GameStateResponse, actor: PlayerAuth) => {
      const actorState = resolvePlayerState(state, actor)
      for (const handCard of actorState.hand) {
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

  throw new Error(`No '${actionLabel}' action found in bottom hand after deterministic phase advancement.`)
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
