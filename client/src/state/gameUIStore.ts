import { create } from 'zustand'
import type { SetStateAction } from 'react'
import type { IGameStateResponse } from '@/services/api/types/game'
import { useAuthSessionStore } from '@/state/authSession'
import { useGameHubStore } from '@/state/gameHubStore'
import { areActionListsEqual, resolveCurrentPlayer, toggleEffectTargetSelection, toggleSummonTargetSelection } from '@/views/game/utils/functions'
import type { IGameUIStoreState } from '@/state/types/gameUIStore'

function resolveUpdate<T>(value: SetStateAction<T>, previous: T): T {
  return typeof value === 'function' ? (value as (previous: T) => T)(previous) : value
}

const BOARD_PROMPT_SELECTION_ZONES = new Set<string>(['Hand', 'CharacterField', 'SupportZone', 'Leader'])

export function resolveBoardPromptCandidateInstanceIds(pendingPrompt: IGameStateResponse['pendingPrompt']): string[] {
  if (!pendingPrompt || pendingPrompt.type !== 'Effect' || !pendingPrompt.isAwaitingRequestingPlayer) {
    return []
  }

  if (pendingPrompt.selectionPromptKind === 'RevealPresentation') {
    return []
  }

  if (!BOARD_PROMPT_SELECTION_ZONES.has(pendingPrompt.candidateZone ?? '')) {
    return []
  }

  return pendingPrompt.options ?? []
}

function normalizeInstanceId(instanceId: string): string {
  return instanceId.trim().toLowerCase()
}

function isBoardPromptCandidate(pendingPrompt: IGameStateResponse['pendingPrompt'], cardInstanceId: string): boolean {
  const normalized = normalizeInstanceId(cardInstanceId)
  return resolveBoardPromptCandidateInstanceIds(pendingPrompt).some(
    (candidateInstanceId) => normalizeInstanceId(candidateInstanceId) === normalized,
  )
}

const initialState = {
  bottomHandFaceUpByInstanceId: {},
  isMulliganAnimationPending: false,
  pendingPromptSelection: null,
  pendingCardTargeting: null,
  pendingSummonTargeting: null,
  pendingEffectTargeting: null,
  optimisticRestedByInstanceId: {},
  activeAttackLink: null,
  lastSubmittedAttackSourceInstanceId: null,
  isPhasePresentationPending: false,
  retainedInteractiveAvailableActions: [],
  retainedIsActionBlocked: false,
  isSupportWindowHudHolding: false,
}

export const useGameUIStore = create<IGameUIStoreState>()((set) => ({
  ...initialState,
  setBottomHandFaceUpByInstanceId: (value) =>
    set((state) => ({ bottomHandFaceUpByInstanceId: resolveUpdate(value, state.bottomHandFaceUpByInstanceId) })),
  setIsMulliganAnimationPending: (value) =>
    set((state) => ({ isMulliganAnimationPending: resolveUpdate(value, state.isMulliganAnimationPending) })),
  setPendingCardTargeting: (value) =>
    set((state) => ({ pendingCardTargeting: resolveUpdate(value, state.pendingCardTargeting) })),
  setPendingSummonTargeting: (value) =>
    set((state) => ({ pendingSummonTargeting: resolveUpdate(value, state.pendingSummonTargeting) })),
  setPendingEffectTargeting: (value) =>
    set((state) => ({ pendingEffectTargeting: resolveUpdate(value, state.pendingEffectTargeting) })),
  setOptimisticRestedByInstanceId: (value) =>
    set((state) => ({ optimisticRestedByInstanceId: resolveUpdate(value, state.optimisticRestedByInstanceId) })),
  setActiveAttackLink: (value) =>
    set((state) => ({ activeAttackLink: resolveUpdate(value, state.activeAttackLink) })),
  beginBattleTargeting: (targeting) =>
    set(() => ({
      activeAttackLink: null,
      pendingSummonTargeting: null,
      pendingEffectTargeting: null,
      pendingCardTargeting: { ...targeting, kind: 'battle' },
    })),
  beginEffectTargeting: (targeting) =>
    set(() => ({
      activeAttackLink: null,
      pendingSummonTargeting: null,
      pendingEffectTargeting: null,
      pendingCardTargeting: { ...targeting, kind: 'effect' },
    })),
  cancelBattleTargeting: () => set({ pendingCardTargeting: null, activeAttackLink: null }),
  beginSummonTargeting: (targeting) =>
    set(() => ({
      pendingCardTargeting: null,
      pendingEffectTargeting: null,
      activeAttackLink: null,
      pendingSummonTargeting: targeting,
    })),
  cancelSummonTargeting: () => set({ pendingSummonTargeting: null }),
  beginEffectMultiTargeting: (targeting) =>
    set(() => ({
      pendingCardTargeting: null,
      pendingSummonTargeting: null,
      activeAttackLink: null,
      pendingEffectTargeting: targeting,
    })),
  cancelEffectTargeting: () => set({ pendingEffectTargeting: null }),
  clearPromptSelection: () => set({ pendingPromptSelection: null }),
  toggleEffectTarget: (targetCardInstanceId) => {
    const pendingPrompt = useGameHubStore.getState().gameState?.pendingPrompt ?? null
    if (isBoardPromptCandidate(pendingPrompt, targetCardInstanceId)) {
      set({
        pendingPromptSelection: {
          promptId: pendingPrompt?.promptId ?? '',
          selectedInstanceId: targetCardInstanceId,
        },
      })
      return
    }

    toggleEffectTargetSelection({
      targetCardInstanceId,
      setPendingEffectTargeting: (action) =>
        set((state) => ({ pendingEffectTargeting: resolveUpdate(action, state.pendingEffectTargeting) })),
    })
  },
  toggleSummonTarget: (targetCardInstanceId) =>
    toggleSummonTargetSelection({
      targetCardInstanceId,
      setPendingSummonTargeting: (action) =>
        set((state) => ({ pendingSummonTargeting: resolveUpdate(action, state.pendingSummonTargeting) })),
    }),
  setLastSubmittedAttackSourceInstanceId: (value) =>
    set((state) => ({ lastSubmittedAttackSourceInstanceId: resolveUpdate(value, state.lastSubmittedAttackSourceInstanceId) })),
  setIsPhasePresentationPending: (value) =>
    set((state) => ({ isPhasePresentationPending: resolveUpdate(value, state.isPhasePresentationPending) })),
  setRetainedInteractiveAvailableActions: (value) =>
    set((state) => ({ retainedInteractiveAvailableActions: resolveUpdate(value, state.retainedInteractiveAvailableActions) })),
  setRetainedIsActionBlocked: (value) =>
    set((state) => ({ retainedIsActionBlocked: resolveUpdate(value, state.retainedIsActionBlocked) })),
  setIsSupportWindowHudHolding: (value) =>
    set((state) => ({ isSupportWindowHudHolding: resolveUpdate(value, state.isSupportWindowHudHolding) })),
}))

function recordsEqual(left: Record<string, boolean>, right: Record<string, boolean>): boolean {
  const leftKeys = Object.keys(left)
  if (leftKeys.length !== Object.keys(right).length) {
    return false
  }

  return leftKeys.every((key) => right[key] === left[key])
}

function pruneStaleGameUIState(): void {
  const ui = useGameUIStore.getState()
  const gameState = useGameHubStore.getState().gameState
  if (!gameState) {
    return
  }

  const userId = useAuthSessionStore.getState().session?.userId
  const currentPlayer = resolveCurrentPlayer(gameState.players, userId)
  const currentHand = currentPlayer?.hand ?? []
  const availableActions = gameState.availableActions

  if (gameState.gameOutcome) {
    if (ui.pendingCardTargeting) {
      ui.setPendingCardTargeting(null)
    }
    if (ui.pendingSummonTargeting) {
      ui.setPendingSummonTargeting(null)
    }
    if (ui.pendingEffectTargeting) {
      ui.setPendingEffectTargeting(null)
    }
    if (ui.pendingPromptSelection) {
      ui.clearPromptSelection()
    }
    if (ui.activeAttackLink) {
      ui.setActiveAttackLink(null)
    }
    if (ui.lastSubmittedAttackSourceInstanceId !== null) {
      ui.setLastSubmittedAttackSourceInstanceId(null)
    }
    if (Object.keys(ui.optimisticRestedByInstanceId).length > 0) {
      ui.setOptimisticRestedByInstanceId({})
    }
    return
  }

  const pendingBattleTargeting = ui.pendingCardTargeting
  if (pendingBattleTargeting && pendingBattleTargeting.kind === 'battle') {
    const actionId = pendingBattleTargeting.actionId
    const sourceId = pendingBattleTargeting.sourceCardInstanceId.trim().toLowerCase()
    const matchingBattleAction = availableActions.find((option) => option.actionId === actionId)
    const sourceCards = [
      ...(currentPlayer?.leader ? [currentPlayer.leader] : []),
      ...(currentPlayer?.characterField ?? []),
    ]
    const sourceCard = sourceCards.find((card) => card.instanceId.trim().toLowerCase() === sourceId)
    const matchingSourceCardAction = (sourceCard?.availableActions ?? []).find((option) => option.actionId === actionId)
    const stillAvailable = Boolean(sourceCard)
      && (Boolean(matchingBattleAction?.isEnabled) || Boolean(matchingSourceCardAction?.isEnabled))
    if (!stillAvailable) {
      ui.setPendingCardTargeting(null)
    }
  }

  const pendingEffectTargeting = ui.pendingCardTargeting
  if (pendingEffectTargeting && pendingEffectTargeting.kind === 'effect') {
    const actionId = pendingEffectTargeting.actionId
    const sourceId = pendingEffectTargeting.sourceCardInstanceId.trim().toLowerCase()
    const matchingAction = availableActions.find((option) => option.actionId === actionId)
    const sourceCards = [
      ...(currentPlayer?.leader ? [currentPlayer.leader] : []),
      ...(currentPlayer?.characterField ?? []),
      ...(currentPlayer?.supportZone ?? []),
      ...currentHand,
    ]
    const sourceCard = sourceCards.find((card) => card.instanceId.trim().toLowerCase() === sourceId)
    const matchingSourceCardAction = (sourceCard?.availableActions ?? []).find((option) => option.actionId === actionId)
    const stillAvailable = Boolean(matchingAction?.isEnabled) || Boolean(matchingSourceCardAction?.isEnabled)
    if (!stillAvailable) {
      ui.setPendingCardTargeting(null)
    }
  }

  const pendingPromptSelection = ui.pendingPromptSelection
  if (pendingPromptSelection && pendingPromptSelection.promptId !== (gameState.pendingPrompt?.promptId ?? '')) {
    ui.clearPromptSelection()
  }

  const pendingSummonTargeting = ui.pendingSummonTargeting
  if (pendingSummonTargeting) {
    const actionId = pendingSummonTargeting.actionId
    const sourceId = pendingSummonTargeting.sourceCardInstanceId.trim().toLowerCase()
    const pendingCard = currentHand.find((card) => card.instanceId.trim().toLowerCase() === sourceId)
    const matchingAction = (pendingCard?.availableActions ?? []).find((option) => option.actionId === actionId)
    if (!matchingAction?.isEnabled) {
      ui.setPendingSummonTargeting(null)
    }
  }

  const pendingEffectMultiTargeting = ui.pendingEffectTargeting
  if (pendingEffectMultiTargeting) {
    const actionId = pendingEffectMultiTargeting.actionId
    const sourceId = pendingEffectMultiTargeting.sourceCardInstanceId.trim().toLowerCase()
    const sourceCards = [
      ...currentHand,
      ...(currentPlayer?.supportZone ?? []),
      ...(currentPlayer?.characterField ?? []),
    ]
    const matchingAction = availableActions.find((option) => option.actionId === actionId)
    const sourceCard = sourceCards.find((card) => card.instanceId.trim().toLowerCase() === sourceId)
    const matchingSourceCardAction = (sourceCard?.availableActions ?? []).find((option) => option.actionId === actionId)
    const stillAvailable = Boolean(matchingAction?.isEnabled) || Boolean(matchingSourceCardAction?.isEnabled)
    if (!stillAvailable) {
      ui.setPendingEffectTargeting(null)
    }
  }

  const actionError = useGameHubStore.getState().actionError

  if (Object.keys(ui.optimisticRestedByInstanceId).length > 0) {
    const characterFieldCards = gameState.players.flatMap((player) => player.characterField)
    const nextOptimisticRestedByInstanceId: Record<string, boolean> = {}
    for (const [instanceId, shouldRemainOptimistic] of Object.entries(ui.optimisticRestedByInstanceId)) {
      if (!shouldRemainOptimistic) {
        continue
      }

      const normalizedInstanceId = instanceId.trim().toLowerCase()
      const matchedCard = characterFieldCards.find((card) => card.instanceId.trim().toLowerCase() === normalizedInstanceId)
      if (!matchedCard) {
        continue
      }

      if (matchedCard.isRested) {
        continue
      }

      nextOptimisticRestedByInstanceId[instanceId] = true
    }

    if (!recordsEqual(ui.optimisticRestedByInstanceId, nextOptimisticRestedByInstanceId)) {
      ui.setOptimisticRestedByInstanceId(nextOptimisticRestedByInstanceId)
    }

    if (Object.keys(nextOptimisticRestedByInstanceId).length === 0 && ui.lastSubmittedAttackSourceInstanceId !== null) {
      ui.setLastSubmittedAttackSourceInstanceId(null)
    }
  }

  if (!gameState.isAttackSequencePending && ui.activeAttackLink !== null) {
    ui.setActiveAttackLink(null)
  }

  const pendingAttackAttackerInstanceId =
    gameState.pendingAttackVisualState?.attackerCardInstanceId?.trim().toLowerCase() ?? ''
  const isOwnSubmittedAttackConfirmed = pendingAttackAttackerInstanceId.length > 0
    && pendingAttackAttackerInstanceId
      === (ui.lastSubmittedAttackSourceInstanceId ?? '').trim().toLowerCase()

  if (actionError && !isOwnSubmittedAttackConfirmed) {
    const sourceCardInstanceId = ui.lastSubmittedAttackSourceInstanceId
    if (sourceCardInstanceId) {
      ui.setOptimisticRestedByInstanceId((previous) => {
        const nextState = { ...previous }
        delete nextState[sourceCardInstanceId]
        return nextState
      })
      ui.setActiveAttackLink(null)
      ui.setLastSubmittedAttackSourceInstanceId(null)
    }
  }
}

let pruneQueued = false
function schedulePruneStaleGameUIState(): void {
  if (pruneQueued) {
    return
  }

  pruneQueued = true
  queueMicrotask(() => {
    pruneQueued = false
    pruneStaleGameUIState()
  })
}

function clearPhasePresentationHudLatch(ui: IGameUIStoreState): void {
  if (ui.isPhasePresentationPending) {
    ui.setIsPhasePresentationPending(false)
  }
  if (ui.retainedIsActionBlocked) {
    ui.setRetainedIsActionBlocked(false)
  }
  if (ui.isSupportWindowHudHolding) {
    ui.setIsSupportWindowHudHolding(false)
  }
  if (ui.retainedInteractiveAvailableActions.length > 0) {
    ui.setRetainedInteractiveAvailableActions([])
  }
}

function syncPhasePresentationHudLatch(): void {
  const hubState = useGameHubStore.getState()
  const ui = useGameUIStore.getState()
  const gameState = hubState.gameState

  if (!gameState || gameState.gameOutcome) {
    clearPhasePresentationHudLatch(ui)
    return
  }

  const isPhasePresentationPending = Boolean(gameState.pendingPresentation)

  if (ui.isPhasePresentationPending !== isPhasePresentationPending) {
    ui.setIsPhasePresentationPending(isPhasePresentationPending)
  }

  if (isPhasePresentationPending) {
    return
  }

  const isSupportWindowHudHolding =
    gameState.isSupportResponseWindowOpen === true && gameState.availableActions.length === 0

  if (ui.isSupportWindowHudHolding !== isSupportWindowHudHolding) {
    ui.setIsSupportWindowHudHolding(isSupportWindowHudHolding)
  }

  if (isSupportWindowHudHolding) {
    return
  }

  const isActionBlocked = !hubState.isConnected || hubState.isActionPending
  if (ui.retainedIsActionBlocked !== isActionBlocked) {
    ui.setRetainedIsActionBlocked(isActionBlocked)
  }

  if (!areActionListsEqual(ui.retainedInteractiveAvailableActions, gameState.availableActions)) {
    ui.setRetainedInteractiveAvailableActions(gameState.availableActions)
  }
}

useGameHubStore.subscribe((state, previousState) => {
  if (
    state.gameState !== previousState.gameState
    || state.actionError !== previousState.actionError
  ) {
    schedulePruneStaleGameUIState()
  }

  if (
    state.gameState !== previousState.gameState
    || state.isConnected !== previousState.isConnected
    || state.isActionPending !== previousState.isActionPending
    || state.activeGameId !== previousState.activeGameId
  ) {
    syncPhasePresentationHudLatch()
  }
})
useGameUIStore.subscribe(schedulePruneStaleGameUIState)

