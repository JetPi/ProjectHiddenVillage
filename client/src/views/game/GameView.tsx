import { useMemo, useRef, useState } from 'react'
import { useLoaderData } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui'
import { useAuthSessionStore } from '@/state/authSession'
import { useThemeStore } from '@/state/themeStore'
import {
  buildLeaderCardFrameClass,
  readPersistedBattlefieldDisplayOrder,
} from '@/views/game/utils/functions'
import { toPromptPresentation } from '@/views/game/utils/functions/prompts'
import type { IAttackTargetingState, IGameLoaderData, ISubmitHubIntentRequest, ISummonTargetingState } from '@/views/game/types'
import type { IGameActionOptionResponse } from '@/services/api/types/game'
import { BottomHandReorderRow, GameHandRow, GamePromptOverlay, GameZones } from '@/views/game/components'
import {
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
  DRAW_TO_HAND_STAGGER_MS,
  DRAW_TO_HAND_REVEAL_DELAY_MS,
  HAND_TO_PILE_STAGGER_MS,
  HAND_TO_PILE_DURATION_MS,
} from '@/views/game/utils/contants'
import { runHandToPileAnimation, runRectToDynamicElementAnimation, waitMillis, mapActionToHubIntent, toggleSummonTargetSelection } from '@/views/game/utils/functions'
import { CardBack } from '@/components/ui/cards'
import {
  useAutoAdvancePhaseEffect,
  useCardCatalogPreload,
  useHandZoneAnimationEffects,
  useGameUIState,
  useDerivedGameViewState,
  useGameAnimationController,
  useGameRefs,
  useGameHubState,
  useGetBattlefieldDisplayOrderStorageKey,
  usePersistedBattlefieldDisplayOrderEffect,
  useBattlefieldCardReorderEffect,
  useBattlefieldCards,
  useCurrentBattlefieldRawCards,
  useLiveCatalogRefresh,
  useGetMainPhaseActions,
  usePassLikeAction,
  useOccupiedSupportSlots,
  usePendingActions,
  useAvailableActionMapper,
  usePendingSummon,
  useOptimisticResting,
  useBackendAttackLink,
  useActiveAttackSequence
} from '@/views/game/hooks'

export function GameView() {
  const { joinCode, gameCards, gameState: initialGameState } = useLoaderData() as IGameLoaderData
  const authUserId = useAuthSessionStore((state) => state.session?.userId)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)

  const battlefieldDisplayOrderStorageKey = useGetBattlefieldDisplayOrderStorageKey(authUserId!, joinCode)

  const AUTO_SIGNAL_PHASES = useMemo(() => new Set([
    'DrawInitialHand',
    'RefreshPhase',
    'StartOfMainPhase',
    'DrawPhase',
    'AttackResolution',
    'BattleEndStep',
    'EndStep',
  ]), [])

  const viewRefs = useGameRefs()
  const animControllerRef = useGameAnimationController()
  const {
    bottomHandFaceUpByInstanceId,
    setBottomHandFaceUpByInstanceId,
    isMulliganAnimationPending,
    setIsMulliganAnimationPending,
    pendingSetSupportCardInstanceId,
    setPendingSetSupportCardInstanceId,
    pendingCardTargeting,
    setPendingCardTargeting,
    pendingSummonTargeting,
    setPendingSummonTargeting,
    optimisticRestedByInstanceId,
    setOptimisticRestedByInstanceId,
    activeAttackLink,
    setActiveAttackLink,
  } = useGameUIState()
  const isCardCatalogRefreshInFlightRef = useRef(false)
  const lastRequestedMissingCardIdsKeyRef = useRef('')

  const [liveGameCards, setLiveGameCards] = useState<IGameLoaderData['gameCards']>(gameCards)

  const persistedBattlefieldOrder = readPersistedBattlefieldDisplayOrder(battlefieldDisplayOrderStorageKey)
  const [topBattlefieldDisplayOrder, setTopBattlefieldDisplayOrder] = useState<string[]>(() => {
    return persistedBattlefieldOrder.top
  })
  const [bottomBattlefieldDisplayOrder, setBottomBattlefieldDisplayOrder] = useState<string[]>(() => {
    return persistedBattlefieldOrder.bottom
  })

  const gameHubState = useGameHubState(joinCode, initialGameState, authUserId)

  const {
    gameState,
    isConnected,
    isActionPending,
    actionError,
    submitHubIntent,
    getCardActionTargets,
    refreshGameState,
  } = gameHubState

  usePersistedBattlefieldDisplayOrderEffect(battlefieldDisplayOrderStorageKey, topBattlefieldDisplayOrder, bottomBattlefieldDisplayOrder)
  const lastSubmittedAttackSourceRef = useRef<string | null>(null)

  const players = gameState.players

  useLiveCatalogRefresh({
    setLiveGameCards,
    liveGameCards,
    players,
    joinCode,
    lastRequestedMissingCardIdsKeyRef,
    isCardCatalogRefreshInFlightRef,
  })

  const derivedGameState = useDerivedGameViewState(liveGameCards, players, authUserId)
  const { topLeaderCard, bottomLeaderCard } = derivedGameState

  const occupiedBottomSupportSlots = useOccupiedSupportSlots({ derivedGameState })

  const topHandCards = useMemo(() => derivedGameState.opponentPlayer?.hand ?? [], [derivedGameState.opponentPlayer?.hand])
  const bottomHandCards = useMemo(() => derivedGameState.currentPlayer?.hand ?? [], [derivedGameState.currentPlayer?.hand])
  const topHandInstanceIds = useMemo(() => topHandCards.map((card) => card.instanceId), [topHandCards])
  const bottomHandInstanceIds = useMemo(() => bottomHandCards.map((card) => card.instanceId), [bottomHandCards])
  const topDeckCount = derivedGameState.opponentPlayer?.deckCount ?? 0
  const bottomDeckCount = derivedGameState.currentPlayer?.deckCount ?? 0
  const topTrashCount = derivedGameState.opponentPlayer?.trash.length ?? 0
  const bottomTrashCount = derivedGameState.currentPlayer?.trash.length ?? 0

  const currentTopBattlefieldRawCards = useCurrentBattlefieldRawCards(derivedGameState.opponentPlayer)
  const currentBottomBattlefieldRawCards = useCurrentBattlefieldRawCards(derivedGameState.currentPlayer)

  const topBattlefieldCards = useBattlefieldCards(topBattlefieldDisplayOrder, currentTopBattlefieldRawCards)
  const bottomBattlefieldCards = useBattlefieldCards(bottomBattlefieldDisplayOrder, currentBottomBattlefieldRawCards)

  useBattlefieldCardReorderEffect(currentTopBattlefieldRawCards, setTopBattlefieldDisplayOrder)
  useBattlefieldCardReorderEffect(currentBottomBattlefieldRawCards, setBottomBattlefieldDisplayOrder)

  const topLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(topLeaderCard))
  const bottomLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(bottomLeaderCard))

  useCardCatalogPreload(liveGameCards)

  const promptPresentation = toPromptPresentation(gameState.pendingPrompt)

  const shouldShowPromptOverlay =
    promptPresentation?.renderAsOverlay === true && promptPresentation.isAwaitingRequestingPlayer
  const canResolvePrompt = gameState.pendingPrompt?.isAwaitingRequestingPlayer ?? false
  const hasPendingPromptFlag = Boolean(gameState.pendingPrompt)
  const isActionPendingFlag = isActionPending

  const mappedAvailableActions = shouldShowPromptOverlay
    ? gameState.availableActions.filter((action) => !action.actionId.startsWith('resolve-prompt:'))
    : gameState.availableActions

  const canShowHandNoActionsMessage =
    Boolean(authUserId)
    && gameState.phase === 'MainPhase'
    && gameState.activePlayerId.trim().toLowerCase() === authUserId?.trim().toLowerCase()
    && !gameState.pendingPrompt

  useGetMainPhaseActions({
    gameHubState,
    derivedGameState,
    authUserId,
    isActionPending,
    hasPendingPromptFlag,
    bottomHandCards,
    refreshGameState,
  })

  const passLikeAction = usePassLikeAction({ mappedAvailableActions })

  const isBattleActionTargeting = pendingCardTargeting !== null
  const isSummonActionTargeting = pendingSummonTargeting !== null

  usePendingActions({
    pendingSetSupportCardInstanceId,
    mappedAvailableActions,
    bottomHandCards,
    setPendingSetSupportCardInstanceId,
  })

  useAvailableActionMapper({
    pendingCardTargeting,
    mappedAvailableActions,
    derivedGameState,
    setPendingCardTargeting,
  })

  usePendingSummon({
    pendingSummonTargeting,
    bottomHandCards,
    setPendingSummonTargeting,
  })

  useOptimisticResting({
    gameState,
    setActiveAttackLink,
    setOptimisticRestedByInstanceId,
    lastSubmittedAttackSourceRef,
  })

  useActiveAttackSequence({
    gameState,
    setActiveAttackLink,
    setOptimisticRestedByInstanceId,
    lastSubmittedAttackSourceRef,
    actionError,
  })

  const backendAttackLink = useBackendAttackLink({ gameState })
  const renderedAttackLink = activeAttackLink ?? backendAttackLink

  function beginBattleTargeting(targeting: IAttackTargetingState): void {
    setPendingSetSupportCardInstanceId(null)
    setActiveAttackLink(null)
    setPendingSummonTargeting(null)
    setPendingCardTargeting({ ...targeting, kind: 'battle' })
  }

  function beginEffectTargeting(targeting: IAttackTargetingState): void {
    setPendingSetSupportCardInstanceId(null)
    setActiveAttackLink(null)
    setPendingSummonTargeting(null)
    setPendingCardTargeting({ ...targeting, kind: 'effect' })
  }

  function cancelBattleTargeting(): void {
    setPendingCardTargeting(null)
    setActiveAttackLink(null)
  }

  function beginSummonTargeting(targeting: ISummonTargetingState): void {
    setPendingSetSupportCardInstanceId(null)
    setPendingCardTargeting(null)
    setActiveAttackLink(null)
    setPendingSummonTargeting(targeting)
  }

  function cancelSummonTargeting(): void {
    setPendingSummonTargeting(null)
  }

  function handleToggleSummonTarget(targetCardInstanceId: string): void {
    toggleSummonTargetSelection({ targetCardInstanceId, setPendingSummonTargeting })
  }

  function canConfirmSummonTargetSelection(targeting: ISummonTargetingState): boolean {
    const selectedCount = targeting.selectedTargets.length

    if (typeof targeting.exactTargetCount === 'number') {
      return selectedCount === targeting.exactTargetCount
    }

    if (typeof targeting.minimumTargetCount === 'number' && selectedCount < targeting.minimumTargetCount) {
      return false
    }

    if (typeof targeting.maximumTargetCount === 'number' && selectedCount > targeting.maximumTargetCount) {
      return false
    }

    return selectedCount > 0 || targeting.validTargets.length === 0
  }

  function submitSummonTargetSelection(): void {
    if (!pendingSummonTargeting || !canConfirmSummonTargetSelection(pendingSummonTargeting)) {
      return
    }

    const sourceCardInstanceId = pendingSummonTargeting.sourceCardInstanceId
    const sourceCardElement = viewRefs.bottomHandRowRef.current?.querySelector<HTMLDivElement>(
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

    setPendingSummonTargeting(null)

    void (async () => {
      await runSubmitThenZoneEntryAnimation({
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
          const exactCardElement = viewRefs.boardZoneRef.current?.querySelector<HTMLElement>(
            `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${sourceCardInstanceId}"]`,
          ) ?? null
          if (exactCardElement) {
            return exactCardElement
          }

          return viewRefs.boardZoneRef.current?.querySelector<HTMLElement>(
            `[data-zone="character-field-card"][data-slot-side="bottom"][data-slot-index="${expectedBattlefieldSlotIndex}"]`,
          ) ?? null
        },
        timeoutMs: 1800,
        maxFrames: 120,
      })
    })()
  }

  function submitCardTargetSelection(targetCardInstanceId: string): void {
    if (!pendingCardTargeting) {
      return
    }

    const selectedTarget = pendingCardTargeting.validTargets.find((target) =>
      target.cardInstanceId.trim().toLowerCase() === targetCardInstanceId.trim().toLowerCase())

    if (!selectedTarget) {
      return
    }

    const sourceCardInstanceId = pendingCardTargeting.sourceCardInstanceId
    const intentRequest: ISubmitHubIntentRequest = {
      intent: 'execute-card-action',
      actionId: pendingCardTargeting.actionId,
      sourceCardInstanceId,
      selectedTargets: [selectedTarget],
    }

    const isBattle = pendingCardTargeting.kind === 'battle'
    if (isBattle) {
      lastSubmittedAttackSourceRef.current = sourceCardInstanceId
      setOptimisticRestedByInstanceId((previous) => ({
        ...previous,
        [sourceCardInstanceId]: true,
      }))
      setActiveAttackLink({
        sourceCardInstanceId,
        targetCardInstanceId: selectedTarget.cardInstanceId,
        targetZone: selectedTarget.zone,
        targetPlayerId: selectedTarget.playerId,
      })
    }

    setPendingCardTargeting(null)

    void (async () => {
      await submitHubIntent(intentRequest)
    })()
  }

  function resolveBattleSourceCardInstanceId(action: IGameActionOptionResponse): string | null {
    const actionId = action.actionId
    const battleCardByActionId = (derivedGameState.currentPlayer?.characterField ?? []).find((card) =>
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

  useHandZoneAnimationEffects({
    topHandInstanceIds,
    bottomHandInstanceIds,
    topDeckCount,
    bottomDeckCount,
    topTrashCount,
    bottomTrashCount,
    drawToHandStaggerMs: DRAW_TO_HAND_STAGGER_MS,
    drawToHandRevealDelayMs: DRAW_TO_HAND_REVEAL_DELAY_MS,
    handToPileStaggerMs: HAND_TO_PILE_STAGGER_MS,
    topDeckCardRef: viewRefs.topDeckCardRef,
    bottomDeckCardRef: viewRefs.bottomDeckCardRef,
    topTrashCardRef: viewRefs.topTrashCardRef,
    bottomTrashCardRef: viewRefs.bottomTrashCardRef,
    topHandRowRef: viewRefs.topHandRowRef,
    bottomHandRowRef: viewRefs.bottomHandRowRef,
    animControllerRef,
    setBottomHandFaceUpByInstanceId,
  })

  useAutoAdvancePhaseEffect({
    isConnected,
    isActionPendingFlag,
    hasPendingPromptFlag,
    availableActions: gameState.availableActions,
    phase: gameState.phase,
    turnNumber: gameState.turnNumber,
    activePlayerId: gameState.activePlayerId,
    autoSignalPhases: AUTO_SIGNAL_PHASES,
    animControllerRef,
    submitHubIntent,
  })

  async function runSubmitThenZoneEntryAnimation({
    intentRequest,
    sourceRect,
    beforeAnimation,
    resolveDestinationElement,
    resolveFallbackElement,
    durationMs,
    timeoutMs,
    maxFrames,
  }: {
    intentRequest: NonNullable<ReturnType<typeof mapActionToHubIntent>>
    sourceRect: DOMRect | null
    beforeAnimation?: () => void
    resolveDestinationElement: () => HTMLElement | null
    resolveFallbackElement?: () => HTMLElement | null
    durationMs?: number
    timeoutMs?: number
    maxFrames?: number
  }): Promise<void> {
    await submitHubIntent(intentRequest)
    beforeAnimation?.()

    if (!sourceRect) {
      return
    }

    await runRectToDynamicElementAnimation({
      sourceRect,
      resolveDestinationElement,
      resolveFallbackElement,
      durationMs,
      timeoutMs,
      maxFrames,
    })
  }

  async function trySubmitTargetedCardEffect(action: IGameActionOptionResponse): Promise<void> {
    if (!action.isEnabled) {
      return
    }

    const intentRequest = mapActionToHubIntent(action, canResolvePrompt)
    if (!intentRequest || intentRequest.intent !== 'execute-card-action') {
      return
    }

    const targetsResponse = await getCardActionTargets({
      actionId: intentRequest.actionId,
      sourceCardInstanceId: intentRequest.sourceCardInstanceId,
    })

    if (!targetsResponse || !targetsResponse.isEnabled) {
      return
    }

    const validTargets = targetsResponse.validTargets
    const exactTargetCount = targetsResponse.exactTargetCount
    const minimumTargetCount = targetsResponse.minimumTargetCount
    const maximumTargetCount = targetsResponse.maximumTargetCount
    const autoSelectAll = targetsResponse.autoSelectAllValidTargets && validTargets.length > 0

    const shouldAutoSubmit =
      autoSelectAll
      || validTargets.length === 0
      || (typeof exactTargetCount === 'number' && validTargets.length === exactTargetCount)

    if (shouldAutoSubmit) {
      await submitHubIntent({
        intent: 'execute-card-action',
        actionId: intentRequest.actionId,
        sourceCardInstanceId: intentRequest.sourceCardInstanceId,
        selectedTargets: validTargets,
      })
      return
    }

    const requiresSingleTargetPick =
      validTargets.length > 0
      && (exactTargetCount === null || exactTargetCount === 1)
      && (minimumTargetCount === null || minimumTargetCount === 1)
      && (maximumTargetCount === null || maximumTargetCount === 1)

    if (requiresSingleTargetPick) {
      beginEffectTargeting({
        actionId: intentRequest.actionId,
        sourceCardInstanceId: intentRequest.sourceCardInstanceId,
        validTargets,
      })
    }
  }

  function submitMappedAction(action: IGameActionOptionResponse): void {
    if (!action.isEnabled) {
      return
    }

    if (action.actionId.startsWith('leader-effect:')) {
      void trySubmitTargetedCardEffect(action)
      return
    }

    const isBattleAction = action.actionId.startsWith('battle-action:')
      || action.label.trim().toLowerCase() === 'battle'

    if (isBattleAction) {
      const sourceCardInstanceId = resolveBattleSourceCardInstanceId(action)
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
      void trySubmitTargetedCardEffect(action)
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
          const sourceCardElement = viewRefs.bottomHandRowRef.current?.querySelector<HTMLDivElement>(
            `[data-hand-instance-id="${cardInstanceId}"]`,
          ) ?? null
          const sourceRect = sourceCardElement?.getBoundingClientRect() ?? null
          const expectedBattlefieldSlotIndex = currentBottomBattlefieldRawCards.length

          await runSubmitThenZoneEntryAnimation({
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
              const exactCardElement = viewRefs.boardZoneRef.current?.querySelector<HTMLElement>(
                `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${cardInstanceId}"]`,
              ) ?? null
              if (exactCardElement) {
                return exactCardElement
              }

              return viewRefs.boardZoneRef.current?.querySelector<HTMLElement>(
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

        const sourceHandRowElement = viewRefs.bottomHandRowRef.current
        const sourceCardElement = sourceHandRowElement?.querySelector<HTMLDivElement>(
          `[data-hand-instance-id="${cardInstanceId}"]`,
        ) ?? null
        const sourceRect = sourceCardElement?.getBoundingClientRect() ?? null
        const expectedBattlefieldSlotIndex = currentBottomBattlefieldRawCards.length

        await runSubmitThenZoneEntryAnimation({
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
            const exactCardElement = viewRefs.boardZoneRef.current?.querySelector<HTMLElement>(
              `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${cardInstanceId}"]`,
            ) ?? null
            if (exactCardElement) {
              return exactCardElement
            }

            return viewRefs.boardZoneRef.current?.querySelector<HTMLElement>(
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

    if (pendingSetSupportCardInstanceId) {
      setPendingSetSupportCardInstanceId(null)
    }

    if (pendingCardTargeting) {
      setPendingCardTargeting(null)
    }

    if (pendingSummonTargeting) {
      setPendingSummonTargeting(null)
    }

    void submitHubIntent(intentRequest)
  }

  function submitSetSupportToSlot(slotIndex: number): void {
    if (!pendingSetSupportCardInstanceId) {
      return
    }

    const pendingActionId = `set-support:${pendingSetSupportCardInstanceId}`
    const action = mappedAvailableActions.find((option) => option.actionId === pendingActionId)
      ?? bottomHandCards
        .find((card) => card.instanceId === pendingSetSupportCardInstanceId)
        ?.availableActions
        ?.find((option) => option.actionId === pendingActionId)

    if (!action) {
      setPendingSetSupportCardInstanceId(null)
      return
    }

    if (slotIndex < 0 || slotIndex > 4) {
      return
    }

    if (occupiedBottomSupportSlots.has(slotIndex)) {
      return
    }

    const intentRequest = mapActionToHubIntent(
      action,
      canResolvePrompt,
      undefined,
      { supportSlotIndex: slotIndex.toString() },
    )

    const sourceCardElement = viewRefs.bottomHandRowRef.current?.querySelector<HTMLDivElement>(
      `[data-hand-instance-id="${pendingSetSupportCardInstanceId}"]`,
    ) ?? null
    const sourceRect = sourceCardElement?.getBoundingClientRect() ?? null

    if (!intentRequest) {
      return
    }

    const cardInstanceId = pendingSetSupportCardInstanceId
    setPendingSetSupportCardInstanceId(null)

    void (async () => {
      await runSubmitThenZoneEntryAnimation({
        intentRequest,
        sourceRect,
        resolveDestinationElement: () => {
          const exactCardElement = viewRefs.boardZoneRef.current?.querySelector<HTMLElement>(
            `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${cardInstanceId}"]`,
          ) ?? null
          if (exactCardElement) {
            return exactCardElement
          }

          return viewRefs.boardZoneRef.current?.querySelector<HTMLElement>(
            `[data-zone="support"][data-slot-side="bottom"][data-slot-index="${slotIndex}"][data-card-instance-id]`,
          ) ?? null
        },
        timeoutMs: 1800,
        maxFrames: 120,
      })
    })()
  }

  function handlePassLikeAction(): void {
    if (!passLikeAction || !passLikeAction.isEnabled) {
      return
    }

    submitMappedAction(passLikeAction)
  }

  async function handlePromptResolve(selectedOption: string): Promise<void> {
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
          topDeckCardRef: viewRefs.topDeckCardRef,
          bottomDeckCardRef: viewRefs.bottomDeckCardRef,
          topTrashCardRef: viewRefs.topTrashCardRef,
          bottomTrashCardRef: viewRefs.bottomTrashCardRef,
          topHandRowRef: viewRefs.topHandRowRef,
          bottomHandRowRef: viewRefs.bottomHandRowRef,
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

  return (
    <PageShell
      compact
      edgeToEdge
      data-testid="game-view-root"
      className="pt-0 pb-0 sm:pt-0 sm:pb-0 lg:pt-0 lg:pb-0"
      overlayClassName="opacity-65"
    >
      <div
        className={`mx-auto h-full min-h-0 w-full overflow-visible gap-1.5 rounded-2xl ${GAMEBOARD_MAX_WIDTH_CLASS} ${GAMEBOARD_COLUMNS_CLASS}`}
      >
        <Panel
          className="col-span-full h-full min-h-0 border-hidden overflow-visible bg-transparent pt-0 pb-0.5 px-0.5 backdrop-blur-none"
          style={{ backdropFilter: 'none' }}
        >
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,0.6fr)_minmax(0,6.1fr)_minmax(0,1.85fr)] gap-1 rounded-2xl px-0 pt-0 pb-0">
            <GameHandRow
              cards={topHandCards}
              rowRef={viewRefs.setTopHandRowRefs}
              rowTestId="top-hand-row"
              rowClassName="h-[230%] -translate-y-[62%]"
              renderCard={(card) => (
                <div
                  key={`top-hand-${card.instanceId}`}
                  data-hand-instance-id={card.instanceId}
                  className="h-full aspect-[200/277] shrink-0"
                >
                  <CardBack className="h-full w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
                </div>
              )}
            />

            <GameZones
              boardZoneRef={viewRefs.setBoardZoneRef}
              joinCode={joinCode}
              derivedGameState={derivedGameState}
              topBattlefieldCardsOverride={topBattlefieldCards}
              bottomBattlefieldCardsOverride={bottomBattlefieldCards}
              topDeckCardRef={viewRefs.setTopDeckCardRef}
              bottomDeckCardRef={viewRefs.setBottomDeckCardRef}
              topTrashCardRef={viewRefs.setTopTrashCardRef}
              bottomTrashCardRef={viewRefs.setBottomTrashCardRef}
              topLeaderCardFrameClassName={topLeaderCardFrameClassName}
              bottomLeaderCardFrameClassName={bottomLeaderCardFrameClassName}
              gameState={gameState}
              authUserId={authUserId}
              availableActions={mappedAvailableActions}
              pendingSetSupportCardInstanceId={pendingSetSupportCardInstanceId}
              pendingAttackTargeting={pendingCardTargeting}
              pendingSummonTargeting={pendingSummonTargeting}
              optimisticRestedByInstanceId={optimisticRestedByInstanceId}
              activeAttackLink={renderedAttackLink}
              isBattleActionTargeting={isBattleActionTargeting}
              isSummonActionTargeting={isSummonActionTargeting}
              isConnected={isConnected}
              isActionPending={isActionPending}
              onSelectAction={submitMappedAction}
              onSelectSupportSlotForSet={submitSetSupportToSlot}
              onCancelSetSupportSelection={() => setPendingSetSupportCardInstanceId(null)}
              onSelectAttackTarget={submitCardTargetSelection}
              onCancelAttackTargetSelection={cancelBattleTargeting}
              onToggleSummonTarget={handleToggleSummonTarget}
              canConfirmSummonTargetSelection={pendingSummonTargeting ? canConfirmSummonTargetSelection(pendingSummonTargeting) : false}
              onConfirmSummonTargetSelection={submitSummonTargetSelection}
              onCancelSummonTargetSelection={cancelSummonTargeting}
              onToggleTheme={toggleTheme}
              onPassTurn={handlePassLikeAction}
            />

            <BottomHandReorderRow
              cards={bottomHandCards}
              rowRef={viewRefs.setBottomHandRowRefs}
              cardById={derivedGameState.cardById}
              availableActions={mappedAvailableActions}
              faceUpByInstanceId={bottomHandFaceUpByInstanceId}
              showNoActionsMessage={canShowHandNoActionsMessage}
              isConnected={isConnected}
              isActionPending={isActionPending}
              onSelectCardActionOption={submitMappedAction}
            />
          </div>
        </Panel>

        <GamePromptOverlay
          isOpen={shouldShowPromptOverlay}
          prompt={promptPresentation}
          isConnected={isConnected}
          isActionPending={isActionPending || isMulliganAnimationPending}
          onResolve={(selectedOption) => {
            void handlePromptResolve(selectedOption)
          }}
        />

      </div>
    </PageShell>
  )
}

