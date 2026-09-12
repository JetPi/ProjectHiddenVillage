import { create } from 'zustand'
import type { SetStateAction } from 'react'
import { useAuthSessionStore } from '@/state/authSession'
import { useGameHubStore } from '@/state/gameHubStore'
import { resolveCurrentPlayer, toggleSummonTargetSelection } from '@/views/game/utils/functions'
import type { IGameUIStoreState } from '@/state/types/gameUIStore'

function resolveUpdate<T>(value: SetStateAction<T>, previous: T): T {
  return typeof value === 'function' ? (value as (previous: T) => T)(previous) : value
}

const initialState = {
  bottomHandFaceUpByInstanceId: {},
  isMulliganAnimationPending: false,
  pendingSetSupportCardInstanceId: null,
  pendingCardTargeting: null,
  pendingSummonTargeting: null,
  optimisticRestedByInstanceId: {},
  activeAttackLink: null,
  lastSubmittedAttackSourceInstanceId: null,
}

export const useGameUIStore = create<IGameUIStoreState>()((set) => ({
  ...initialState,
  setBottomHandFaceUpByInstanceId: (value) =>
    set((state) => ({ bottomHandFaceUpByInstanceId: resolveUpdate(value, state.bottomHandFaceUpByInstanceId) })),
  setIsMulliganAnimationPending: (value) =>
    set((state) => ({ isMulliganAnimationPending: resolveUpdate(value, state.isMulliganAnimationPending) })),
  setPendingSetSupportCardInstanceId: (value) =>
    set((state) => ({ pendingSetSupportCardInstanceId: resolveUpdate(value, state.pendingSetSupportCardInstanceId) })),
  setPendingCardTargeting: (value) =>
    set((state) => ({ pendingCardTargeting: resolveUpdate(value, state.pendingCardTargeting) })),
  setPendingSummonTargeting: (value) =>
    set((state) => ({ pendingSummonTargeting: resolveUpdate(value, state.pendingSummonTargeting) })),
  setOptimisticRestedByInstanceId: (value) =>
    set((state) => ({ optimisticRestedByInstanceId: resolveUpdate(value, state.optimisticRestedByInstanceId) })),
  setActiveAttackLink: (value) =>
    set((state) => ({ activeAttackLink: resolveUpdate(value, state.activeAttackLink) })),
  cancelSetSupportSelection: () => set({ pendingSetSupportCardInstanceId: null }),
  beginBattleTargeting: (targeting) =>
    set(() => ({
      pendingSetSupportCardInstanceId: null,
      activeAttackLink: null,
      pendingSummonTargeting: null,
      pendingCardTargeting: { ...targeting, kind: 'battle' },
    })),
  beginEffectTargeting: (targeting) =>
    set(() => ({
      pendingSetSupportCardInstanceId: null,
      activeAttackLink: null,
      pendingSummonTargeting: null,
      pendingCardTargeting: { ...targeting, kind: 'effect' },
    })),
  cancelBattleTargeting: () => set({ pendingCardTargeting: null, activeAttackLink: null }),
  beginSummonTargeting: (targeting) =>
    set(() => ({
      pendingSetSupportCardInstanceId: null,
      pendingCardTargeting: null,
      activeAttackLink: null,
      pendingSummonTargeting: targeting,
    })),
  cancelSummonTargeting: () => set({ pendingSummonTargeting: null }),
  toggleSummonTarget: (targetCardInstanceId) =>
    toggleSummonTargetSelection({
      targetCardInstanceId,
      setPendingSummonTargeting: (action) =>
        set((state) => ({ pendingSummonTargeting: resolveUpdate(action, state.pendingSummonTargeting) })),
    }),
  setLastSubmittedAttackSourceInstanceId: (value) =>
    set((state) => ({ lastSubmittedAttackSourceInstanceId: resolveUpdate(value, state.lastSubmittedAttackSourceInstanceId) })),
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

  const pendingSupportId = ui.pendingSetSupportCardInstanceId
  if (pendingSupportId) {
    const pendingActionId = `set-support:${pendingSupportId}`
    const isGloballyAvailable = availableActions.some((option) => option.actionId === pendingActionId)
    const pendingCard = currentHand.find((card) => card.instanceId === pendingSupportId)
    const isOnCardAvailable = (pendingCard?.availableActions ?? []).some((option) => option.actionId === pendingActionId)
    if (!isGloballyAvailable && !isOnCardAvailable) {
      ui.setPendingSetSupportCardInstanceId(null)
    }
  }

  const pendingBattleTargeting = ui.pendingCardTargeting
  if (pendingBattleTargeting && pendingBattleTargeting.kind === 'battle') {
    const actionId = pendingBattleTargeting.actionId
    const sourceId = pendingBattleTargeting.sourceCardInstanceId.trim().toLowerCase()
    const characterField = currentPlayer?.characterField ?? []
    const matchingBattleAction = availableActions.find((option) => option.actionId === actionId)
    const sourceCard = characterField.find((card) => card.instanceId.trim().toLowerCase() === sourceId)
    const matchingSourceCardAction = (sourceCard?.availableActions ?? []).find((option) => option.actionId === actionId)
    const stillAvailable = Boolean(sourceCard)
      && (Boolean(matchingBattleAction?.isEnabled) || Boolean(matchingSourceCardAction?.isEnabled))
    if (!stillAvailable) {
      ui.setPendingCardTargeting(null)
    }
  }

  // Effect targeting (leader/support/card effects) must not outlive the action that opened it — the
  // server turns the action disabled (once per turn, spent chakra, timing passed) or drops it entirely.
  const pendingEffectTargeting = ui.pendingCardTargeting
  if (pendingEffectTargeting && pendingEffectTargeting.kind === 'effect') {
    const actionId = pendingEffectTargeting.actionId
    const sourceId = pendingEffectTargeting.sourceCardInstanceId.trim().toLowerCase()
    const matchingAction = availableActions.find((option) => option.actionId === actionId)
    // Leader effects are published on the leader card itself (`leader-effect:{leaderInstanceId}:{key}`),
    // never in the global action list, so the leader must be part of the source scope - otherwise the
    // mode is pruned the instant it is opened and the board never prompts for a target.
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

  const actionError = useGameHubStore.getState().actionError

  // Reconcile optimistic resting with the authoritative game state.
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

      // Exhaustion means the card left play, so it never reads as rested here: an exiled card is
      // simply absent from the field and drops out via the lookup above.
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

  // A failed action must not leave the board rendering an attack the backend never confirmed.
  // Keep the optimistic rest only while the backend's pending-attack state names our attacker.
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

useGameHubStore.subscribe((state, previousState) => {
  if (
    state.gameState !== previousState.gameState
    || state.actionError !== previousState.actionError
  ) {
    schedulePruneStaleGameUIState()
  }
})
useGameUIStore.subscribe(schedulePruneStaleGameUIState)

