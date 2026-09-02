import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLoaderData } from 'react-router-dom'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui'
import { useAuthSessionStore } from '@/state/authSession'
import { useThemeStore } from '@/state/themeStore'
import {
  buildLeaderCardFrameClass,
} from '@/views/game/utils/functions'
import { toPromptPresentation } from '@/views/game/utils/functions/prompts'
import type { IGameLoaderData } from '@/views/game/types/routeData'
import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { ISubmitHubIntentRequest } from '@/views/game/types/hub'
import type { IAttackFlowLinkState, IAttackTargetingState } from '@/views/game/types/attackTargeting'
import { fetchGameCards } from '@/services/api/gameApi'
import type { IGameViewAnimController } from '@/views/game/types/hooks'
import { useAutoAdvancePhaseEffect, useCardCatalogPreload, useHandZoneAnimationEffects } from '@/views/game/hooks/useGameViewEffects'
import { useDerivedGameViewState } from '@/views/game/hooks/useDerivedGameViewState'
import { useGameHubState } from '@/views/game/hooks/useGameHubState'
import { useLongPressHandReorder } from '@/views/game/hooks/useLongPressHandReorder'
import { GameHandRow } from '@/views/game/components/GameHandRow'
import { NonLeaderCardOverlay } from '@/views/game/components/NonLeaderCardOverlay'
import { GameZones } from '@/views/game/components/GameZones'
import { GamePromptOverlay } from '@/views/game/components/GamePromptOverlay'
import {
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
  DRAW_TO_HAND_STAGGER_MS,
  DRAW_TO_HAND_REVEAL_DELAY_MS,
  HAND_TO_PILE_STAGGER_MS,
  HAND_TO_PILE_DURATION_MS,
} from '@/views/game/utils/contants'
import { mapActionToHubIntent } from '@/views/game/utils/functions/gameState'
import { runHandToPileAnimation, runRectToDynamicElementAnimation, waitMillis } from '@/views/game/utils/functions/animations'
import { resolveCardActionOptionsForInstanceId } from '@/views/game/utils/functions/cards'
import { CardBack, CardImage, FlippableCard } from '@/components/ui/cards'

function normalizeCardInstanceId(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function normalizePlayerId(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/-/g, '')
}

function readPersistedBattlefieldDisplayOrder(storageKey: string): {
  top: string[]
  bottom: string[]
} {
  if (typeof window === 'undefined') {
    return { top: [], bottom: [] }
  }

  const serializedOrder = window.sessionStorage.getItem(storageKey)
  if (!serializedOrder) {
    return { top: [], bottom: [] }
  }

  try {
    const parsedOrder = JSON.parse(serializedOrder) as {
      top?: unknown
      bottom?: unknown
    }

    return {
      top: Array.isArray(parsedOrder.top)
        ? parsedOrder.top.filter((entry): entry is string => typeof entry === 'string')
        : [],
      bottom: Array.isArray(parsedOrder.bottom)
        ? parsedOrder.bottom.filter((entry): entry is string => typeof entry === 'string')
        : [],
    }
  } catch {
    return { top: [], bottom: [] }
  }
}


export function GameView() {
  const AUTO_SIGNAL_PHASES = useMemo(() => new Set([
    'DrawInitialHand',
    'RefreshPhase',
    'StartOfMainPhase',
    'DrawPhase',
    'AttackResolution',
    'BattleEndStep',
    'EndStep',
  ]), [])

  const boardZoneRef = useRef<HTMLDivElement | null>(null)
  const topDeckCardRef = useRef<HTMLDivElement | null>(null)
  const bottomDeckCardRef = useRef<HTMLDivElement | null>(null)
  const topTrashCardRef = useRef<HTMLDivElement | null>(null)
  const bottomTrashCardRef = useRef<HTMLDivElement | null>(null)
  const topHandRowRef = useRef<HTMLDivElement | null>(null)
  const bottomHandRowRef = useRef<HTMLDivElement | null>(null)
  const [topHandAutoAnimateRef] = useAutoAnimate({ duration: 220, easing: 'ease-out' })
  const [bottomHandAutoAnimateRef, setBottomHandAutoAnimateEnabled] = useAutoAnimate({ duration: 220, easing: 'ease-out' })
  const animControllerRef = useRef<IGameViewAnimController>({
    lastAutoSignalKey: '',
    pendingDrawAnimationFrameId: null,
    pendingDrawTimeoutIds: [],
    pendingMulliganDrawReplay: false,
    previousHandZoneSnapshot: {
      topHandInstanceIds: new Set<string>(),
      bottomHandInstanceIds: new Set<string>(),
      topDeckCount: 0,
      bottomDeckCount: 0,
      topTrashCount: 0,
      bottomTrashCount: 0,
      isInitialized: false,
    },
  })
  const isCardCatalogRefreshInFlightRef = useRef(false)
  const lastRequestedMissingCardIdsKeyRef = useRef('')
  const [bottomHandFaceUpByInstanceId, setBottomHandFaceUpByInstanceId] = useState<Record<string, boolean>>({})
  const [isMulliganAnimationPending, setIsMulliganAnimationPending] = useState(false)
  const [pendingSetSupportCardInstanceId, setPendingSetSupportCardInstanceId] = useState<string | null>(null)
  const [pendingAttackTargeting, setPendingAttackTargeting] = useState<IAttackTargetingState | null>(null)
  const [optimisticRestedByInstanceId, setOptimisticRestedByInstanceId] = useState<Record<string, boolean>>({})
  const [activeAttackLink, setActiveAttackLink] = useState<IAttackFlowLinkState | null>(null)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)
  const authUserId = useAuthSessionStore((state) => state.session?.userId)

  const setTopHandRowRefs = useCallback((node: HTMLDivElement | null) => {
    topHandRowRef.current = node
    topHandAutoAnimateRef(node)
  }, [topHandAutoAnimateRef])

  const setBottomHandRowRefs = useCallback((node: HTMLDivElement | null) => {
    bottomHandRowRef.current = node
    bottomHandAutoAnimateRef(node)
  }, [bottomHandAutoAnimateRef])
  
  const { joinCode, gameCards, gameState: initialGameState } = useLoaderData() as IGameLoaderData
  const [liveGameCards, setLiveGameCards] = useState<IGameLoaderData['gameCards']>(gameCards)
  const battlefieldDisplayOrderStorageKey = useMemo(() => {
    const normalizedUserId = normalizePlayerId(authUserId)
    return `phv:battlefield-display-order:${joinCode}:${normalizedUserId || 'anonymous'}`
  }, [authUserId, joinCode])
  const [topBattlefieldDisplayOrder, setTopBattlefieldDisplayOrder] = useState<string[]>(() => {
    return readPersistedBattlefieldDisplayOrder(battlefieldDisplayOrderStorageKey).top
  })
  const [bottomBattlefieldDisplayOrder, setBottomBattlefieldDisplayOrder] = useState<string[]>(() => {
    return readPersistedBattlefieldDisplayOrder(battlefieldDisplayOrderStorageKey).bottom
  })

  const {
    gameState,
    isConnected,
    isActionPending,
    actionError,
    submitHubIntent,
    getCardActionTargets,
  } = useGameHubState(joinCode, initialGameState, authUserId)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const payload = JSON.stringify({
      top: topBattlefieldDisplayOrder,
      bottom: bottomBattlefieldDisplayOrder,
    })

    window.sessionStorage.setItem(battlefieldDisplayOrderStorageKey, payload)
  }, [battlefieldDisplayOrderStorageKey, bottomBattlefieldDisplayOrder, topBattlefieldDisplayOrder])
  const lastSubmittedAttackSourceRef = useRef<string | null>(null)

  const players = gameState.players

  useEffect(() => {
    const knownCardIds = new Set(liveGameCards.map((card) => card.id.trim().toLowerCase()))
    const referencedCardIds = new Set<string>()

    for (const player of players) {
      const leaderCardDefinitionId = player.leader?.cardDefinitionId?.trim().toLowerCase()
      if (leaderCardDefinitionId) {
        referencedCardIds.add(leaderCardDefinitionId)
      }

      const allCardInstances = [
        ...player.deck,
        ...player.hand,
        ...player.characterField,
        ...player.supportZone,
        ...player.trash,
        ...player.exileZone,
      ]

      for (const cardInstance of allCardInstances) {
        const normalizedCardId = cardInstance.cardDefinitionId.trim().toLowerCase()
        if (normalizedCardId) {
          referencedCardIds.add(normalizedCardId)
        }
      }
    }

    const missingCardIds = [...referencedCardIds]
      .filter((cardId) => !knownCardIds.has(cardId))
      .sort()

    if (missingCardIds.length === 0) {
      lastRequestedMissingCardIdsKeyRef.current = ''
      return
    }

    const missingCardIdsKey = missingCardIds.join('|')
    if (lastRequestedMissingCardIdsKeyRef.current === missingCardIdsKey || isCardCatalogRefreshInFlightRef.current) {
      return
    }

    let cancelled = false
    isCardCatalogRefreshInFlightRef.current = true
    lastRequestedMissingCardIdsKeyRef.current = missingCardIdsKey

    void fetchGameCards(joinCode)
      .then((freshCards) => {
        if (cancelled) {
          return
        }

        setLiveGameCards((previousCards) => {
          const mergedById = new Map<string, IGameLoaderData['gameCards'][number]>()

          for (const card of previousCards) {
            const normalizedCardId = card.id.trim().toLowerCase()
            if (!normalizedCardId) {
              continue
            }

            mergedById.set(normalizedCardId, card)
          }

          for (const card of freshCards) {
            const normalizedCardId = card.id.trim().toLowerCase()
            if (!normalizedCardId) {
              continue
            }

            mergedById.set(normalizedCardId, card)
          }

          return Array.from(mergedById.values())
        })
      })
      .catch(() => {
        // Live catalog refresh is best effort and must not block gameplay rendering.
      })
      .finally(() => {
        isCardCatalogRefreshInFlightRef.current = false
      })

    return () => {
      cancelled = true
    }
  }, [joinCode, liveGameCards, players])

  const derivedGameState = useDerivedGameViewState(liveGameCards, players, authUserId)
  const { topLeaderCard, bottomLeaderCard } = derivedGameState
  const topHandCards = useMemo(() => derivedGameState.opponentPlayer?.hand ?? [], [derivedGameState.opponentPlayer?.hand])
  const bottomHandCards = useMemo(() => derivedGameState.currentPlayer?.hand ?? [], [derivedGameState.currentPlayer?.hand])
  const {
    orderedCards: orderedBottomHandCards,
    activeDraggedInstanceId,
    isReorderDragging,
    getCardPointerHandlers,
  } = useLongPressHandReorder({
    cards: bottomHandCards,
    rowRef: bottomHandRowRef,
  })
  const topHandInstanceIds = useMemo(() => topHandCards.map((card) => card.instanceId), [topHandCards])
  const bottomHandInstanceIds = useMemo(() => orderedBottomHandCards.map((card) => card.instanceId), [orderedBottomHandCards])
  const topDeckCount = derivedGameState.opponentPlayer?.deckCount ?? 0
  const bottomDeckCount = derivedGameState.currentPlayer?.deckCount ?? 0
  const topTrashCount = derivedGameState.opponentPlayer?.trash.length ?? 0
  const bottomTrashCount = derivedGameState.currentPlayer?.trash.length ?? 0
  const currentTopBattlefieldRawCards = useMemo(
    () => derivedGameState.opponentPlayer?.characterField ?? [],
    [derivedGameState.opponentPlayer?.characterField],
  )
  const topBattlefieldCards = useMemo(() => {
    const baseCards = currentTopBattlefieldRawCards
    const knownIds = new Set(baseCards.map((card) => card.instanceId))
    const preservedIds = topBattlefieldDisplayOrder.filter((instanceId) => knownIds.has(instanceId))
    const preservedIdSet = new Set(preservedIds)
    const appendedIds = baseCards.map((card) => card.instanceId).filter((instanceId) => !preservedIdSet.has(instanceId))
    const orderedIds = [...preservedIds, ...appendedIds]
    const cardsById = new Map(baseCards.map((card) => [card.instanceId, card]))
    return orderedIds
      .map((instanceId) => cardsById.get(instanceId))
      .filter((card): card is typeof baseCards[number] => Boolean(card))
  }, [currentTopBattlefieldRawCards, topBattlefieldDisplayOrder])
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setTopBattlefieldDisplayOrder((previousOrder) => {
        const knownIds = new Set(currentTopBattlefieldRawCards.map((card) => card.instanceId))
        const preservedIds = previousOrder.filter((instanceId) => knownIds.has(instanceId))
        const preservedIdSet = new Set(preservedIds)
        const appendedIds = currentTopBattlefieldRawCards
          .map((card) => card.instanceId)
          .filter((instanceId) => !preservedIdSet.has(instanceId))
        return [...preservedIds, ...appendedIds]
      })
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentTopBattlefieldRawCards])
  const currentBottomBattlefieldRawCards = useMemo(
    () => derivedGameState.currentPlayer?.characterField ?? [],
    [derivedGameState.currentPlayer?.characterField],
  )
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setBottomBattlefieldDisplayOrder((previousOrder) => {
        const knownIds = new Set(currentBottomBattlefieldRawCards.map((card) => card.instanceId))
        const preservedIds = previousOrder.filter((instanceId) => knownIds.has(instanceId))
        const preservedIdSet = new Set(preservedIds)
        const appendedIds = currentBottomBattlefieldRawCards
          .map((card) => card.instanceId)
          .filter((instanceId) => !preservedIdSet.has(instanceId))
        return [...preservedIds, ...appendedIds]
      })
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [currentBottomBattlefieldRawCards])
  const bottomBattlefieldCards = useMemo(() => {
    const baseCards = currentBottomBattlefieldRawCards
    const knownIds = new Set(baseCards.map((card) => card.instanceId))
    const preservedIds = bottomBattlefieldDisplayOrder.filter((instanceId) => knownIds.has(instanceId))
    const preservedIdSet = new Set(preservedIds)
    const appendedIds = baseCards.map((card) => card.instanceId).filter((instanceId) => !preservedIdSet.has(instanceId))
    const orderedIds = [...preservedIds, ...appendedIds]
    const cardsById = new Map(baseCards.map((card) => [card.instanceId, card]))
    return orderedIds
      .map((instanceId) => cardsById.get(instanceId))
      .filter((card): card is typeof baseCards[number] => Boolean(card))
  }, [bottomBattlefieldDisplayOrder, currentBottomBattlefieldRawCards])

  const topLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(topLeaderCard))
  const bottomLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(bottomLeaderCard))

  useCardCatalogPreload(liveGameCards)

  useEffect(() => {
    setBottomHandAutoAnimateEnabled(!isReorderDragging)
  }, [isReorderDragging, setBottomHandAutoAnimateEnabled])

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    console.log('[GameView] Received gameState update', gameState)
  }, [gameState])

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

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }

    const currentPlayerRaw = gameState.players.find((player) =>
      player.playerId.trim().toLowerCase() === authUserId?.trim().toLowerCase())

    const rawLeaderActions = currentPlayerRaw?.leader?.availableActions ?? []
    const resolvedLeaderActions = bottomLeaderCard
      ? resolveCardActionOptionsForInstanceId(
        mappedAvailableActions,
        bottomLeaderCard.instanceId,
        bottomLeaderCard.availableActions,
      )
      : []

    const currentPlayerBattlefieldActions = (derivedGameState.currentPlayer?.characterField ?? []).map((card) => ({
      instanceId: card.instanceId,
      availableActions: card.availableActions ?? [],
    }))

    console.log('[GameView][ActionDebug] Leader and battlefield action states', {
      gameId: gameState.gameId,
      phase: gameState.phase,
      turnNumber: gameState.turnNumber,
      activePlayerId: gameState.activePlayerId,
      priorityPlayerId: gameState.priorityPlayerId,
      authUserId,
      rawLeaderActions,
      resolvedLeaderActions,
      currentPlayerBattlefieldActions,
      globalAvailableActions: mappedAvailableActions,
    })
  }, [
    authUserId,
    bottomLeaderCard,
    derivedGameState.currentPlayer?.characterField,
    gameState.activePlayerId,
    gameState.gameId,
    gameState.phase,
    gameState.players,
    gameState.priorityPlayerId,
    gameState.turnNumber,
    mappedAvailableActions,
  ])

  const passLikeAction = useMemo(
    () => mappedAvailableActions.find((action) =>
      action.actionId === 'pass-turn'
      || action.actionId === 'turn-end'
      || action.actionId === 'endPhase'
      || action.actionId === 'declare-end-step'
      || action.actionId === 'advance-phase'),
    [mappedAvailableActions],
  )

  const isBattleActionTargeting = pendingAttackTargeting !== null

  const occupiedBottomSupportSlots = useMemo(() => {
    const occupied = new Set<number>()
    const supportCards = derivedGameState.currentPlayer?.supportZone ?? []
    for (const [currentIndex, supportCard] of supportCards.entries()) {
      if (typeof supportCard.supportSlotIndex === 'number') {
        occupied.add(supportCard.supportSlotIndex)
      } else {
        occupied.add(currentIndex)
      }
    }

    return occupied
  }, [derivedGameState.currentPlayer?.supportZone])

  useEffect(() => {
    if (!pendingSetSupportCardInstanceId) {
      return
    }

    const pendingActionId = `set-support:${pendingSetSupportCardInstanceId}`
    const stillAvailableInGlobalActions = mappedAvailableActions.some((option) =>
      option.actionId === pendingActionId)
    const pendingCard = bottomHandCards.find((card) => card.instanceId === pendingSetSupportCardInstanceId)
    const stillAvailableOnCard = (pendingCard?.availableActions ?? []).some((option) => option.actionId === pendingActionId)
    const stillAvailable = stillAvailableInGlobalActions || stillAvailableOnCard

    if (!stillAvailable) {
      const timeoutId = window.setTimeout(() => {
        setPendingSetSupportCardInstanceId(null)
      }, 0)

      return () => {
        window.clearTimeout(timeoutId)
      }
    }
  }, [bottomHandCards, mappedAvailableActions, pendingSetSupportCardInstanceId])

  useEffect(() => {
    if (!pendingAttackTargeting) {
      return
    }

    const matchingBattleAction = mappedAvailableActions.find((option) =>
      option.actionId === pendingAttackTargeting.actionId)

    const sourceCard = (derivedGameState.currentPlayer?.characterField ?? []).find((card) =>
      card.instanceId.trim().toLowerCase() === pendingAttackTargeting.sourceCardInstanceId.trim().toLowerCase())

    const matchingSourceCardAction = (sourceCard?.availableActions ?? []).find((option) =>
      option.actionId === pendingAttackTargeting.actionId)

    const sourceCardStillControlledByCurrentPlayer = (derivedGameState.currentPlayer?.characterField ?? []).some((card) =>
      card.instanceId.trim().toLowerCase() === pendingAttackTargeting.sourceCardInstanceId.trim().toLowerCase())

    const stillAvailable = sourceCardStillControlledByCurrentPlayer
      && (Boolean(matchingBattleAction?.isEnabled) || Boolean(matchingSourceCardAction?.isEnabled))

    if (stillAvailable) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPendingAttackTargeting(null)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [derivedGameState.currentPlayer?.characterField, mappedAvailableActions, pendingAttackTargeting])

  useEffect(() => {
    setOptimisticRestedByInstanceId((previous) => {
      const previousKeys = Object.keys(previous)
      if (previousKeys.length === 0) {
        return previous
      }

      const nextState: Record<string, boolean> = {}

      for (const [instanceId, shouldRemainOptimistic] of Object.entries(previous)) {
        if (!shouldRemainOptimistic) {
          continue
        }

        const normalizedInstanceId = instanceId.trim().toLowerCase()
        const matchedCard = gameState.players
          .flatMap((player) => player.characterField)
          .find((card) => card.instanceId.trim().toLowerCase() === normalizedInstanceId)

        if (!matchedCard) {
          continue
        }

        if (matchedCard.isRested || matchedCard.isExhausted) {
          continue
        }

        nextState[instanceId] = true
      }

      const nextKeys = Object.keys(nextState)
      if (nextKeys.length === 0) {
        lastSubmittedAttackSourceRef.current = null
        return {}
      }

      if (
        nextKeys.length === previousKeys.length
        && nextKeys.every((key) => previous[key] === true)
      ) {
        return previous
      }

      return nextState
    })

    if (!gameState.isAttackSequencePending) {
      setActiveAttackLink(null)
      return
    }
  }, [gameState.isAttackSequencePending, gameState.players])

  useEffect(() => {
    if (!actionError || gameState.isAttackSequencePending) {
      return
    }

    const sourceCardInstanceId = lastSubmittedAttackSourceRef.current
    if (!sourceCardInstanceId) {
      return
    }

    setOptimisticRestedByInstanceId((previous) => {
      const nextState = { ...previous }
      delete nextState[sourceCardInstanceId]
      return nextState
    })
    setActiveAttackLink(null)
    lastSubmittedAttackSourceRef.current = null
  }, [actionError, gameState.isAttackSequencePending])

  const backendAttackLink = useMemo<IAttackFlowLinkState | null>(() => {
    if (!gameState.isAttackSequencePending) {
      return null
    }

    const pendingAttackVisualState = gameState.pendingAttackVisualState
    if (!pendingAttackVisualState) {
      return null
    }

    const sourceCardInstanceId = pendingAttackVisualState.attackerCardInstanceId
    const sourceCardLookupId = normalizeCardInstanceId(sourceCardInstanceId)
    if (!sourceCardLookupId) {
      return null
    }

    const flattenedCharacterFieldCards = gameState.players.flatMap((player) => player.characterField)
    const sourceCardExists = flattenedCharacterFieldCards.some((card) =>
      normalizeCardInstanceId(card.instanceId) === sourceCardLookupId)

    if (!sourceCardExists) {
      return null
    }

    const normalizedDefenderPlayerId = normalizePlayerId(pendingAttackVisualState.defenderPlayerId)
    const defenderPlayer = gameState.players.find((player) => normalizePlayerId(player.playerId) === normalizedDefenderPlayerId)

    if (!defenderPlayer) {
      return null
    }

    const defenderZone = pendingAttackVisualState.defenderZone
    const pendingDefenderCardInstanceId = normalizeCardInstanceId(pendingAttackVisualState.defenderCardInstanceId)

    if (defenderZone === 'Leader') {
      return {
        sourceCardInstanceId,
        targetCardInstanceId: defenderPlayer.leader.instanceId,
        targetZone: defenderZone,
        targetPlayerId: defenderPlayer.playerId,
      }
    }

    const fallbackTargetCard = defenderPlayer.characterField.find((card) =>
      normalizeCardInstanceId(card.instanceId) === pendingDefenderCardInstanceId)

    if (!fallbackTargetCard) {
      return null
    }

    return {
      sourceCardInstanceId,
      targetCardInstanceId: fallbackTargetCard.instanceId,
      targetZone: defenderZone,
      targetPlayerId: defenderPlayer.playerId,
    }
  }, [gameState.isAttackSequencePending, gameState.pendingAttackVisualState, gameState.players])

  const renderedAttackLink = activeAttackLink ?? backendAttackLink

  function beginBattleTargeting(targeting: IAttackTargetingState): void {
    setPendingSetSupportCardInstanceId(null)
    setActiveAttackLink(null)
    setPendingAttackTargeting(targeting)
  }

  function cancelBattleTargeting(): void {
    setPendingAttackTargeting(null)
    setActiveAttackLink(null)
  }

  function submitBattleTargetSelection(targetCardInstanceId: string): void {
    if (!pendingAttackTargeting) {
      return
    }

    const selectedTarget = pendingAttackTargeting.validTargets.find((target) =>
      target.cardInstanceId.trim().toLowerCase() === targetCardInstanceId.trim().toLowerCase())

    if (!selectedTarget) {
      return
    }

    const sourceCardInstanceId = pendingAttackTargeting.sourceCardInstanceId
    const selectedTargetForLink = selectedTarget
    const intentRequest: ISubmitHubIntentRequest = {
      intent: 'execute-card-action',
      actionId: pendingAttackTargeting.actionId,
      sourceCardInstanceId,
      selectedTargets: [selectedTargetForLink],
    }

    lastSubmittedAttackSourceRef.current = sourceCardInstanceId
    setPendingAttackTargeting(null)
    setOptimisticRestedByInstanceId((previous) => ({
      ...previous,
      [sourceCardInstanceId]: true,
    }))
    setActiveAttackLink({
      sourceCardInstanceId,
      targetCardInstanceId: selectedTargetForLink.cardInstanceId,
      targetZone: selectedTargetForLink.zone,
      targetPlayerId: selectedTargetForLink.playerId,
    })

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
    topDeckCardRef,
    bottomDeckCardRef,
    topTrashCardRef,
    bottomTrashCardRef,
    topHandRowRef,
    bottomHandRowRef,
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

  function submitMappedAction(action: IGameActionOptionResponse): void {
    if (!action.isEnabled) {
      return
    }

    if (action.actionId.startsWith('leader-effect:')) {
      const intentRequest = mapActionToHubIntent(action, canResolvePrompt)
      if (!intentRequest || intentRequest.intent !== 'execute-card-action') {
        return
      }

      void (async () => {
        const targetsResponse = await getCardActionTargets({
          actionId: intentRequest.actionId,
          sourceCardInstanceId: intentRequest.sourceCardInstanceId,
        })

        if (!targetsResponse || !targetsResponse.isEnabled) {
          return
        }

        const autoSelectedTargets = targetsResponse.validTargets
        const exactTargetCount = targetsResponse.exactTargetCount
        const minimumTargetCount = targetsResponse.minimumTargetCount

        if (typeof exactTargetCount === 'number' && autoSelectedTargets.length !== exactTargetCount) {
          return
        }

        if (typeof minimumTargetCount === 'number' && autoSelectedTargets.length < minimumTargetCount) {
          return
        }

        await submitHubIntent({
          intent: 'execute-card-action',
          actionId: intentRequest.actionId,
          sourceCardInstanceId: intentRequest.sourceCardInstanceId,
          selectedTargets: autoSelectedTargets,
        })
      })()

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
      if (!intentRequest) {
        return
      }

      const cardInstanceId = action.actionId.slice(delimiterIndex + 1)
      const expectedBattlefieldSlotIndex = currentBottomBattlefieldRawCards.length
      const sourceHandRowElement = bottomHandRowRef.current
      const sourceCardElement = sourceHandRowElement?.querySelector<HTMLDivElement>(
        `[data-hand-instance-id="${cardInstanceId}"]`,
      ) ?? null
      const sourceRect = sourceCardElement?.getBoundingClientRect() ?? null

      void (async () => {
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
            const exactCardElement = boardZoneRef.current?.querySelector<HTMLElement>(
              `[data-zone="character-field-card"][data-slot-side="bottom"][data-card-instance-id="${cardInstanceId}"]`,
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

      return
    }

    const intentRequest = mapActionToHubIntent(action, canResolvePrompt)
    if (!intentRequest) {
      return
    }

    if (pendingSetSupportCardInstanceId) {
      setPendingSetSupportCardInstanceId(null)
    }

    if (pendingAttackTargeting) {
      setPendingAttackTargeting(null)
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

    const sourceCardElement = bottomHandRowRef.current?.querySelector<HTMLDivElement>(
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
          const exactCardElement = boardZoneRef.current?.querySelector<HTMLElement>(
            `[data-zone="support"][data-slot-side="bottom"][data-card-instance-id="${cardInstanceId}"]`,
          ) ?? null
          if (exactCardElement) {
            return exactCardElement
          }

          return boardZoneRef.current?.querySelector<HTMLElement>(
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
              rowRef={setTopHandRowRefs}
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
              boardZoneRef={boardZoneRef}
              joinCode={joinCode}
              derivedGameState={derivedGameState}
              topBattlefieldCardsOverride={topBattlefieldCards}
              bottomBattlefieldCardsOverride={bottomBattlefieldCards}
              topDeckCardRef={topDeckCardRef}
              bottomDeckCardRef={bottomDeckCardRef}
              topTrashCardRef={topTrashCardRef}
              bottomTrashCardRef={bottomTrashCardRef}
              topLeaderCardFrameClassName={topLeaderCardFrameClassName}
              bottomLeaderCardFrameClassName={bottomLeaderCardFrameClassName}
              gameState={gameState}
              authUserId={authUserId}
              availableActions={mappedAvailableActions}
              pendingSetSupportCardInstanceId={pendingSetSupportCardInstanceId}
              pendingAttackTargeting={pendingAttackTargeting}
              optimisticRestedByInstanceId={optimisticRestedByInstanceId}
              activeAttackLink={renderedAttackLink}
              isBattleActionTargeting={isBattleActionTargeting}
              isConnected={isConnected}
              isActionPending={isActionPending}
              onSelectAction={submitMappedAction}
              onSelectSupportSlotForSet={submitSetSupportToSlot}
              onCancelSetSupportSelection={() => setPendingSetSupportCardInstanceId(null)}
              onSelectAttackTarget={submitBattleTargetSelection}
              onCancelAttackTargetSelection={cancelBattleTargeting}
              onToggleTheme={toggleTheme}
              onPassTurn={handlePassLikeAction}
            />

            <GameHandRow
              cards={orderedBottomHandCards}
              rowRef={setBottomHandRowRefs}
              rowTestId="bottom-hand-row"
              rowClassName="overflow-visible"
              renderCard={(card) => {
                const previewCard = derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null
                const cardActionOptions = resolveCardActionOptionsForInstanceId(
                  mappedAvailableActions,
                  card.instanceId,
                  card.availableActions,
                )
                const cardPointerHandlers = getCardPointerHandlers(card.instanceId)

                return (
                  <div
                    key={`bottom-hand-${card.instanceId}`}
                    data-hand-instance-id={card.instanceId}
                    data-testid={`bottom-hand-card-${card.instanceId}`}
                    draggable={false}
                    onDragStart={(event) => {
                      event.preventDefault()
                    }}
                    className={`h-full aspect-[200/277] shrink-0 select-none ${activeDraggedInstanceId === card.instanceId ? 'z-[260] touch-none' : 'touch-manipulation'}`}
                    {...cardPointerHandlers}
                  >
                    <FlippableCard
                      isFlipped={bottomHandFaceUpByInstanceId[card.instanceId] ?? true}
                      durationMs={340}
                      front={
                        <div className="group relative h-full w-full overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
                          <CardImage
                            src={previewCard?.image ?? null}
                            alt={previewCard?.displayName ?? 'Hand card'}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full rounded-md object-contain"
                          />

                          <NonLeaderCardOverlay
                            previewCard={previewCard}
                            zone="hand"
                            visibilityMode="hover"
                            actionOptions={cardActionOptions}
                            showEmptyActionMessage={canShowHandNoActionsMessage}
                            disableInteractions={isReorderDragging}
                            isConnected={isConnected}
                            isActionPending={isActionPending}
                            onSelectActionOption={(actionId) => {
                              const actionOption = cardActionOptions.find((action) => action.actionId === actionId)
                              if (!actionOption) {
                                return
                              }

                              submitMappedAction(actionOption)
                            }}
                          />
                        </div>
                      }
                      back={<CardBack className="h-full w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />}
                    />
                  </div>
                )
              }}
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

