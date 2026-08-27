import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLoaderData } from 'react-router-dom'
import { useAutoAnimate } from '@formkit/auto-animate/react'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui'
import { useAuthSessionStore } from '@/state/authSession'
import { useThemeStore } from '@/state/themeStore'
import { useAlignedSplit } from '@/views/game/useAlignedSplit'
import {
  buildLeaderCardFrameClass,
} from '@/views/game/utils/functions'
import { toPromptPresentation } from '@/views/game/utils/functions/prompts'
import type { IGameLoaderData } from '@/views/game/types/routeData'
import type { IGameActionOptionResponse } from '@/services/api/types/game'
import type { IGameViewAnimController } from '@/views/game/types/hooks'
import { useAutoAdvancePhaseEffect, useCardCatalogPreload, useHandZoneAnimationEffects } from '@/views/game/hooks/useGameViewEffects'
import { useDerivedGameViewState } from '@/views/game/hooks/useDerivedGameViewState'
import { useGameHubState } from '@/views/game/hooks/useGameHubState'
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
import { runHandToPileAnimation, waitMillis } from '@/views/game/utils/functions/animations'
import { resolveCardActionOptionsForInstanceId } from '@/views/game/utils/functions/cards'
import { CardBack, CardImage, FlippableCard } from '@/components/ui/cards'


export function GameView() {
  const AUTO_SIGNAL_PHASES = useMemo(() => new Set([
    'DrawInitialHand',
    'RefreshPhase',
    'StartOfMainPhase',
    'DrawPhase',
    'AttackDeclaration',
    'AttackResolution',
    'BattleEndStep',
  ]), [])

  const { outerRef: outerZoneRef, innerRef: boardZoneRef } = useAlignedSplit()
  const topDeckCardRef = useRef<HTMLDivElement | null>(null)
  const bottomDeckCardRef = useRef<HTMLDivElement | null>(null)
  const topTrashCardRef = useRef<HTMLDivElement | null>(null)
  const bottomTrashCardRef = useRef<HTMLDivElement | null>(null)
  const topHandRowRef = useRef<HTMLDivElement | null>(null)
  const bottomHandRowRef = useRef<HTMLDivElement | null>(null)
  const [topHandAutoAnimateRef] = useAutoAnimate({ duration: 220, easing: 'ease-out' })
  const [bottomHandAutoAnimateRef] = useAutoAnimate({ duration: 220, easing: 'ease-out' })
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
  const [bottomHandFaceUpByInstanceId, setBottomHandFaceUpByInstanceId] = useState<Record<string, boolean>>({})
  const [isMulliganAnimationPending, setIsMulliganAnimationPending] = useState(false)
  const [pendingSetSupportCardInstanceId, setPendingSetSupportCardInstanceId] = useState<string | null>(null)
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
  const {
    gameState,
    isConnected,
    isActionPending,
    submitHubIntent,
  } = useGameHubState(joinCode, initialGameState, authUserId)

  const players = gameState.players

  const derivedGameState = useDerivedGameViewState(gameCards, players, authUserId)
  const { topLeaderCard, bottomLeaderCard } = derivedGameState
  const topHandCards = useMemo(() => derivedGameState.opponentPlayer?.hand ?? [], [derivedGameState.opponentPlayer?.hand])
  const bottomHandCards = useMemo(() => derivedGameState.currentPlayer?.hand ?? [], [derivedGameState.currentPlayer?.hand])
  const topHandInstanceIds = useMemo(() => topHandCards.map((card) => card.instanceId), [topHandCards])
  const bottomHandInstanceIds = useMemo(() => bottomHandCards.map((card) => card.instanceId), [bottomHandCards])
  const topDeckCount = derivedGameState.opponentPlayer?.deckCount ?? 0
  const bottomDeckCount = derivedGameState.currentPlayer?.deckCount ?? 0
  const topTrashCount = derivedGameState.opponentPlayer?.trash.length ?? 0
  const bottomTrashCount = derivedGameState.currentPlayer?.trash.length ?? 0

  const topLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(topLeaderCard))
  const bottomLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(bottomLeaderCard))

  useCardCatalogPreload(gameCards)

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
    ? gameState.availableActions.filter((action) => !action.actionId.startsWith('resolve-prompt:') && action.actionId !== 'declare-attack')
    : gameState.availableActions.filter((action) => action.actionId !== 'declare-attack')

  const passLikeAction = useMemo(
    () => mappedAvailableActions.find((action) =>
      action.actionId === 'pass-turn'
      || action.actionId === 'turn-end'
      || action.actionId === 'endPhase'
      || action.actionId === 'declare-end-step'
      || action.actionId === 'advance-phase'),
    [mappedAvailableActions],
  )

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

  function submitMappedAction(action: IGameActionOptionResponse): void {
    if (action.actionId.startsWith('set-support:')) {
      const delimiterIndex = action.actionId.indexOf(':')
      if (delimiterIndex < 0 || delimiterIndex === action.actionId.length - 1) {
        return
      }

      setPendingSetSupportCardInstanceId(action.actionId.slice(delimiterIndex + 1))
      return
    }

    const intentRequest = mapActionToHubIntent(action, canResolvePrompt)
    if (!intentRequest) {
      return
    }

    if (pendingSetSupportCardInstanceId) {
      setPendingSetSupportCardInstanceId(null)
    }

    void submitHubIntent(intentRequest)
  }

  function submitSetSupportToSlot(slotIndex: number): void {
    if (!pendingSetSupportCardInstanceId) {
      return
    }

    const action = mappedAvailableActions.find((option) =>
      option.actionId === `set-support:${pendingSetSupportCardInstanceId}`)
    if (!action) {
      setPendingSetSupportCardInstanceId(null)
      return
    }

    const currentPlayerSupportCount = derivedGameState.currentPlayer?.supportZone.length ?? 0
    if (slotIndex < 0 || slotIndex > 4) {
      return
    }

    if (slotIndex !== currentPlayerSupportCount) {
      return
    }

    const intentRequest = mapActionToHubIntent(
      action,
      canResolvePrompt,
      undefined,
      { supportSlotIndex: slotIndex.toString() },
    )

    setPendingSetSupportCardInstanceId(null)

    if (!intentRequest) {
      return
    }

    void submitHubIntent(intentRequest)
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
        runHandToPileAnimation({
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
    <PageShell compact className="pt-0 pb-0 sm:pt-0 sm:pb-0 lg:pt-0 lg:pb-0">
      <div
        ref={outerZoneRef}
        className={`mx-auto h-full min-h-0 w-full overflow-hidden gap-1.5 rounded-2xl ${GAMEBOARD_MAX_WIDTH_CLASS} ${GAMEBOARD_COLUMNS_CLASS}`}
      >
        <Panel className="col-span-full h-full min-h-0 border-hidden overflow-hidden bg-transparent pt-0 pb-0.5 px-1.5">
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,0.6fr)_minmax(0,6.1fr)_minmax(0,1.85fr)] gap-1 rounded-2xl px-1 pt-0 pb-0">
            <GameHandRow
              cards={topHandCards}
              rowRef={setTopHandRowRefs}
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
              isConnected={isConnected}
              isActionPending={isActionPending}
              onSelectAction={submitMappedAction}
              onSelectSupportSlotForSet={submitSetSupportToSlot}
              onCancelSetSupportSelection={() => setPendingSetSupportCardInstanceId(null)}
              onToggleTheme={toggleTheme}
              onPassTurn={handlePassLikeAction}
            />

            <GameHandRow
              cards={bottomHandCards}
              rowRef={setBottomHandRowRefs}
              rowClassName="overflow-hidden"
              renderCard={(card) => {
                const previewCard = derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null

                return (
                  <div
                    key={`bottom-hand-${card.instanceId}`}
                    data-hand-instance-id={card.instanceId}
                    className="h-full aspect-[200/277] shrink-0"
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
                            actionOptions={resolveCardActionOptionsForInstanceId(
                              mappedAvailableActions,
                              card.instanceId,
                              card.availableActions,
                            )}
                            isConnected={isConnected}
                            isActionPending={isActionPending}
                            onSelectActionOption={(actionId) => {
                              const actionOption = mappedAvailableActions.find((action) => action.actionId === actionId)
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

