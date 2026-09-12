import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { fetchGameState } from './api'
import { normalizeUserId } from './core'
import {
  ADVANCE_PHASE_INVALID_STATE_ERROR_CODE,
  describeHubFailure,
  resolvePromptViaHub,
  tryAdvancePhaseViaHub,
} from './hub'
import type { MultiplayerSetup } from './types'

async function getPromptOwnerByType(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  promptType: 'ChooseStartingPlayer' | 'Mulligan',
): Promise<'playerOne' | 'playerTwo' | 'none'> {
  const [playerOneState, playerTwoState] = await Promise.all([
    fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken),
    fetchGameState(request, setup.gameCode, setup.playerTwo.session.accessToken),
  ])

  const playerOneOwnsPrompt =
    playerOneState.pendingPrompt?.type === promptType
    && playerOneState.pendingPrompt.isAwaitingRequestingPlayer
  const playerTwoOwnsPrompt =
    playerTwoState.pendingPrompt?.type === promptType
    && playerTwoState.pendingPrompt.isAwaitingRequestingPlayer

  if (playerOneOwnsPrompt && !playerTwoOwnsPrompt) {
    return 'playerOne'
  }

  if (!playerOneOwnsPrompt && playerTwoOwnsPrompt) {
    return 'playerTwo'
  }

  return 'none'
}

export async function resolveStartingPromptOwner(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<'playerOne' | 'playerTwo'> {
  await expect.poll(async () => {
    return await getPromptOwnerByType(request, setup, 'ChooseStartingPlayer')
  }, {
    timeout: 20_000,
  }).not.toBe('none')

  const owner = await getPromptOwnerByType(request, setup, 'ChooseStartingPlayer')
  return owner === 'playerTwo' ? 'playerTwo' : 'playerOne'
}

export async function waitUntilMulliganPromptOwner(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<'playerOne' | 'playerTwo'> {
  await expect.poll(async () => {
    return await getPromptOwnerByType(request, setup, 'Mulligan')
  }, {
    timeout: 20_000,
  }).not.toBe('none')

  const owner = await getPromptOwnerByType(request, setup, 'Mulligan')
  return owner === 'playerTwo' ? 'playerTwo' : 'playerOne'
}

export async function resolveAllMulliganPrompts(
  request: APIRequestContext,
  setup: MultiplayerSetup,
  selectedOption: 'mulligan' | 'noMulligan',
): Promise<void> {
  const maxPromptResolutions = 4

  for (let resolutionIndex = 0; resolutionIndex < maxPromptResolutions; resolutionIndex += 1) {
    const promptOwner = await getPromptOwnerByType(request, setup, 'Mulligan')
    if (promptOwner === 'none') {
      return
    }

    const owner = promptOwner === 'playerOne' ? setup.playerOne : setup.playerTwo
    await resolvePromptViaHub(setup.gameCode, owner, selectedOption)

    await expect.poll(async () => {
      const state = await fetchGameState(request, setup.gameCode, owner.session.accessToken)
      return state.pendingPrompt?.type ?? 'none'
    }, {
      timeout: 20_000,
    }).not.toBe('Mulligan')
  }

  throw new Error('Failed to fully resolve mulligan prompts within retry limit.')
}

export async function advanceToMulliganPromptIfNeeded(
  request: APIRequestContext,
  setup: MultiplayerSetup,
): Promise<void> {
  const maxAttempts = 20
  let lastRejectedAdvance: string | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const mulliganOwner = await getPromptOwnerByType(request, setup, 'Mulligan')
    if (mulliganOwner !== 'none') {
      return
    }

    const playerOneState = await fetchGameState(request, setup.gameCode, setup.playerOne.session.accessToken)
    const activePlayer = normalizeUserId(playerOneState.activePlayerId) === setup.playerOne.normalizedUserId
      ? setup.playerOne
      : setup.playerTwo
    const canAdvance = playerOneState.availableActions.some((action) => action.actionId === 'advance-phase' && action.isEnabled)

    if (!canAdvance) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      continue
    }

    const result = await tryAdvancePhaseViaHub(setup.gameCode, activePlayer)
    if (result.succeeded) {
      continue
    }

    // Read-then-act race: between the state read above and this call the phase can advance (or a
    // prompt can appear) on the server, which then rejects the advance. Nothing is broken — loop
    // again to observe the mulligan prompt or advance the next phase. Anything else is a real error.
    if (result.errorCode !== ADVANCE_PHASE_INVALID_STATE_ERROR_CODE) {
      throw new Error(describeHubFailure('Hub.AdvancePhase', result))
    }

    lastRejectedAdvance = describeHubFailure('Hub.AdvancePhase', result)
  }

  const rejectedSuffix = lastRejectedAdvance === null ? '' : ` (last rejected advance: ${lastRejectedAdvance})`
  throw new Error(`Failed to reach Mulligan prompt after advancing phases${rejectedSuffix}`)
}
