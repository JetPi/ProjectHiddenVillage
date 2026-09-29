import { create } from 'zustand'
import type { SetStateAction } from 'react'
import type { IGameStateResponse } from '@/services/api/types/game'
import { useAuthSessionStore } from '@/state/authSession'
import { useGameHubStore } from '@/state/gameHubStore'
import { resolveCurrentPlayer, toggleEffectTargetSelection, toggleSummonTargetSelection } from '@/views/game/utils/functions'
import type { IGameUIStoreState } from '@/state/types/gameUIStore'

function resolveUpdate<T>(value: SetStateAction<T>, previous: T): T {
  return typeof value === 'function' ? (value as (previous: T) => T)(previous) : value
}

/**
 * Zones whose cards are drawn on the board, so a prompt asking for a card there is answered by clicking the
 * card's own Select button instead of the card-list overlay. Kept next to the store because the store decides
 * whether a click picks a prompt candidate or toggles an effect-target selection.
 */
const BOARD_PROMPT_SELECTION_ZONES = new Set<string>(['Hand', 'CharacterField', 'SupportZone'])

/**
 * The instance ids a board-answerable effect selection prompt offers. The server resolves them from the
 * effect's own target rules, so this IS the effect's declared set of selectable cards - the board can never
 * offer anything else.
 */
export function resolveBoardPromptCandidateInstanceIds(pendingPrompt: IGameStateResponse['pendingPrompt']): string[] {
  if (!pendingPrompt || pendingPrompt.type !== 'Effect' || !pendingPrompt.isAwaitingRequestingPlayer) {
    return []
  }

  // A reveal presentation's single option is its acknowledgement, not a card to pick.
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
    // A click on one of a prompt's candidates answers that prompt (the card's own Select button): the prompt
    // lists exactly the cards the effect declared selectable, so nothing else can be picked. Everything else
    // stays an effect-target toggle.
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

  const pendingBattleTargeting = ui.pendingCardTargeting
  if (pendingBattleTargeting && pendingBattleTargeting.kind === 'battle') {
    const actionId = pendingBattleTargeting.actionId
    const sourceId = pendingBattleTargeting.sourceCardInstanceId.trim().toLowerCase()
    const matchingBattleAction = availableActions.find((option) => option.actionId === actionId)
    // Battle actions are published on the acting card (`battle-action:{instanceId}`) - battlefield cards
    // and leaders alike - never in the global action list, so the leader must be part of the source
    // scope. Otherwise a leader-declared battle is pruned the instant it opens and the board never
    // prompts for a target.
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

  // A picked prompt candidate is only meaningful while that prompt is still the pending one: the submit
  // effect consumes it, and a prompt answered elsewhere must not leave a stale pick behind.
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

  // Multi-target effect picks (range supports) are opened by an `activate-support` action that can live on
  // a hand card *or* in the support zone, so both scopes have to be searched before the mode is dropped.
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

