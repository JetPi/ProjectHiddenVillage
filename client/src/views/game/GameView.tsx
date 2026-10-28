import { ArrowLeft, X } from 'lucide-react'
import { MotionConfig } from 'motion/react'
import { useGameCardsQuery } from '@/services/queries/cardQueries'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLoaderData, useNavigate } from 'react-router-dom'
import { PageShell } from '@/components/layout/PageShell'
import { Panel } from '@/components/ui'
import { useAuthSessionStore } from '@/state/authSession'
import { useThemeStore } from '@/state/themeStore'
import {
  buildLeaderCardFrameClass,
  extractTargetIds,
  readPersistedBattlefieldDisplayOrder,
} from '@/views/game/utils/functions'
import { toPromptPresentation } from '@/views/game/utils/functions/prompts'
import type { IAttackTargetingState, IEffectTargetingState, IGameLoaderData, ISummonTargetingState } from '@/views/game/types'
import type { IGameActionOptionResponse } from '@/services/api/types/game'
import { ActionLog, BottomHandReorderRow, EffectNoticeBanner, GameHandRow, GamePromptOverlay, GameOverOverlay, GameZones, MatchModifierBadge, PromptSelectionBanner, RedoConsentDialog, RedoWaitingBanner, SupportChainBubble } from '@/views/game/components'
import {
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
} from '@/views/game/utils/contants'
import { PROMPT_RESOLVE_ACTION_ID_PREFIX, buildPromptCandidateCards, handlePromptResolve as resolvePromptAction, submitCardTargetSelection as submitCardTargetAction, submitEffectTargetSelection as submitEffectTargetAction, submitMappedAction as submitMappedGameAction, submitSummonTargetSelection as submitSummonTargetAction } from '@/views/game/utils/functions'
import { CardBack, CardImage, FlippableCard } from '@/components/ui/cards'
import { resolveBoardPromptCandidateInstanceIds, useGameUIStore } from '@/state/gameUIStore'
import { useGameHubStore } from '@/state/gameHubStore'
import {
  useDerivedGameViewState,
  useGameAnimationController,
  useGameRefs,
  useGameHubState,
  useGetBattlefieldDisplayOrderStorageKey,
  usePersistedBattlefieldDisplayOrderEffect,
  useBattlefieldCards,
  useCurrentBattlefieldRawCards,
  useRetainedActionBlocked,
  useRetainedPhaseActionSource,
  useGameCardsBackfill,
  useGameViewSideEffects
} from '@/views/game/hooks'

function isSamePlayerId(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalize = (value: string | null | undefined): string =>
    (value ?? '').trim().toLowerCase().replace(/-/g, '')
  const normalizedLeft = normalize(left)

  return normalizedLeft.length > 0 && normalizedLeft === normalize(right)
}

export function GameView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { joinCode, gameCards, gameState: initialGameState } = useLoaderData() as IGameLoaderData
  const authUserId = useAuthSessionStore((state) => state.session?.userId)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)

  const battlefieldDisplayOrderStorageKey = useGetBattlefieldDisplayOrderStorageKey(authUserId!, joinCode)

  const viewRefs = useGameRefs()
  const animControllerRef = useGameAnimationController()
  const bottomHandFaceUpByInstanceId = useGameUIStore((state) => state.bottomHandFaceUpByInstanceId)
  const isMulliganAnimationPending = useGameUIStore((state) => state.isMulliganAnimationPending)
  const pendingCardTargeting = useGameUIStore((state) => state.pendingCardTargeting)
  const pendingSummonTargeting = useGameUIStore((state) => state.pendingSummonTargeting)
  const pendingEffectTargeting = useGameUIStore((state) => state.pendingEffectTargeting)
  const pendingPromptSelection = useGameUIStore((state) => state.pendingPromptSelection)
  const clearPromptSelection = useGameUIStore((state) => state.clearPromptSelection)
  const isGameOverOverlayDismissed = useGameUIStore((state) => state.isGameOverOverlayDismissed)
  const dismissGameOverOverlay = useGameUIStore((state) => state.dismissGameOverOverlay)
  const setGameOverOverlayDismissed = useGameUIStore((state) => state.setGameOverOverlayDismissed)
  const setBottomHandFaceUpByInstanceId = useGameUIStore((state) => state.setBottomHandFaceUpByInstanceId)
  const setIsMulliganAnimationPending = useGameUIStore((state) => state.setIsMulliganAnimationPending)
  const setPendingCardTargeting = useGameUIStore((state) => state.setPendingCardTargeting)
  const setPendingSummonTargeting = useGameUIStore((state) => state.setPendingSummonTargeting)
  const setPendingEffectTargeting = useGameUIStore((state) => state.setPendingEffectTargeting)
  const setOptimisticRestedByInstanceId = useGameUIStore((state) => state.setOptimisticRestedByInstanceId)
  const setActiveAttackLink = useGameUIStore((state) => state.setActiveAttackLink)
  const setLastSubmittedAttackSourceInstanceId = useGameUIStore((state) => state.setLastSubmittedAttackSourceInstanceId)

  const gameCardsQuery = useGameCardsQuery(joinCode)
  const liveGameCards = gameCardsQuery.data ?? gameCards

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
    forfeitGame,
    requestRedo,
    respondToRedo,
    cancelRedo,
  } = gameHubState
  const setActionError = useGameHubStore((state) => state.setActionError)

  usePersistedBattlefieldDisplayOrderEffect(battlefieldDisplayOrderStorageKey, topBattlefieldDisplayOrder, bottomBattlefieldDisplayOrder)

  const players = gameState.players
  useGameCardsBackfill({ players, liveGameCards, gameCardsQuery })

  const derivedGameState = useDerivedGameViewState(liveGameCards, players, authUserId)
  const { topLeaderCard, bottomLeaderCard } = derivedGameState

  const topHandCards = useMemo(() => derivedGameState.opponentPlayer?.hand ?? [], [derivedGameState.opponentPlayer?.hand])
  const bottomHandCards = useMemo(() => derivedGameState.currentPlayer?.hand ?? [], [derivedGameState.currentPlayer?.hand])

  const currentTopBattlefieldRawCards = useCurrentBattlefieldRawCards(derivedGameState.opponentPlayer)
  const currentBottomBattlefieldRawCards = useCurrentBattlefieldRawCards(derivedGameState.currentPlayer)

  const topBattlefieldCards = useBattlefieldCards(topBattlefieldDisplayOrder, currentTopBattlefieldRawCards)
  const bottomBattlefieldCards = useBattlefieldCards(bottomBattlefieldDisplayOrder, currentBottomBattlefieldRawCards)

  const topLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(topLeaderCard))
  const bottomLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(bottomLeaderCard))

  const isEffectActionTargeting = pendingCardTargeting?.kind === 'effect'
  const validEffectTargetsByCardId = useMemo(() => {
    const targets = isEffectActionTargeting ? extractTargetIds(pendingCardTargeting?.validTargets) : new Set<string>()

    for (const instanceId of resolveBoardPromptCandidateInstanceIds(gameState.pendingPrompt)) {
      targets.add(instanceId.trim().toLowerCase())
    }

    return targets
  }, [isEffectActionTargeting, pendingCardTargeting, gameState.pendingPrompt])

  const promptPresentation = toPromptPresentation(gameState.pendingPrompt)

  const gameOutcome = gameState.gameOutcome ?? null

  // A dismissal belongs to the result it dismissed. A fresh game (or a state that has not ended yet) must show the
  // overlay again, otherwise finishing a second game in the same session would open on a bare board.
  useEffect(() => {
    if (!gameOutcome) {
      setGameOverOverlayDismissed(false)
    }
  }, [gameOutcome, setGameOverOverlayDismissed])

  const shouldShowPromptOverlay =
    gameOutcome === null
    && promptPresentation?.renderAsOverlay === true && promptPresentation.isAwaitingRequestingPlayer
  const shouldShowPromptSelectionBanner =
    promptPresentation?.promptType === 'Effect' && promptPresentation.renderAsOverlay === false
  const canResolvePrompt = gameState.pendingPrompt?.isAwaitingRequestingPlayer ?? false

  const isPromptAwaitingAnswer = gameState.pendingPrompt?.isAwaitingRequestingPlayer === true
  const mappedAvailableActions = isPromptAwaitingAnswer
    ? gameState.availableActions.filter((action) => !action.actionId.startsWith(PROMPT_RESOLVE_ACTION_ID_PREFIX))
    : gameState.availableActions

  useGameViewSideEffects({
    authUserId,
    gameState,
    gameHubState,
    ui: { setBottomHandFaceUpByInstanceId, pendingPromptSelection, clearPromptSelection },
    derivedGameState,
    bottomHandCards,
    liveGameCards,
    viewRefs,
    animControllerRef,
    currentTopBattlefieldRawCards,
    currentBottomBattlefieldRawCards,
    setTopBattlefieldDisplayOrder,
    setBottomBattlefieldDisplayOrder,
  })

  const pendingRedo = gameOutcome === null ? gameState.pendingRedo ?? null : null
  const isRedoPending = pendingRedo !== null
  const isAnsweringRedo = pendingRedo !== null && isSamePlayerId(pendingRedo.approverPlayerId, authUserId)
  const isWaitingForRedoAnswer = isRedoPending && !isAnsweringRedo

  const { isHolding } = useRetainedPhaseActionSource(mappedAvailableActions)
  const { isActionBlocked } = useRetainedActionBlocked(!isConnected || isActionPending || isRedoPending)

  function beginBattleTargeting(targeting: IAttackTargetingState): void {
    setActiveAttackLink(null)
    setPendingSummonTargeting(null)
    setPendingCardTargeting({ ...targeting, kind: 'battle' })
  }

  function beginEffectTargeting(targeting: IAttackTargetingState): void {
    setActiveAttackLink(null)
    setPendingSummonTargeting(null)
    setPendingCardTargeting({ ...targeting, kind: 'effect' })
  }

  function beginSummonTargeting(targeting: ISummonTargetingState): void {
    setPendingCardTargeting(null)
    setActiveAttackLink(null)
    setPendingSummonTargeting(targeting)
  }

  function beginEffectMultiTargeting(targeting: IEffectTargetingState): void {
    setPendingCardTargeting(null)
    setPendingSummonTargeting(null)
    setActiveAttackLink(null)
    setPendingEffectTargeting(targeting)
  }

  const gameActionDeps = {
    ...viewRefs,
    animControllerRef,
    submitHubIntent,
    getCardActionTargets,
    canResolvePrompt,
    promptPresentation,
    bottomHandCards,
    mappedAvailableActions,
    currentBottomBattlefieldRawCards,
    setBottomBattlefieldDisplayOrder,
    pendingCardTargeting,
    setPendingCardTargeting,
    pendingSummonTargeting,
    setPendingSummonTargeting,
    pendingEffectTargeting,
    setPendingEffectTargeting,
    setOptimisticRestedByInstanceId,
    setActiveAttackLink,
    setIsMulliganAnimationPending,
    setLastSubmittedAttackSourceInstanceId,
    characterFieldCards: derivedGameState.currentPlayer?.characterField ?? [],
    beginBattleTargeting,
    beginEffectTargeting,
    beginSummonTargeting,
    beginEffectMultiTargeting,
  }

  function submitSummonTargetSelection(): void {
    submitSummonTargetAction(gameActionDeps)
  }

  function submitEffectTargetSelection(): void {
    submitEffectTargetAction(gameActionDeps)
  }

  function submitCardTargetSelection(targetCardInstanceId: string): void {
    submitCardTargetAction({ ...gameActionDeps, targetCardInstanceId })
  }

  function submitMappedAction(action: IGameActionOptionResponse): void {
    submitMappedGameAction({ ...gameActionDeps, action })
  }

  async function handlePromptResolve(selectedOption: string): Promise<void> {
    await resolvePromptAction({ ...gameActionDeps, selectedOption })
  }

  return (
    <PageShell
      compact
      edgeToEdge
      data-testid="game-view-root"
      className="pt-0 pb-0 sm:pt-0 sm:pb-0 lg:pt-0 lg:pb-0"
      overlayClassName="opacity-65"
    >
      <MotionConfig reducedMotion="user">
      <div
        className={`mx-auto h-full min-h-0 w-full overflow-visible gap-1.5 rounded-2xl ${GAMEBOARD_MAX_WIDTH_CLASS} ${GAMEBOARD_COLUMNS_CLASS}`}
      >
        {/* Only the table's modifiers ride here as a solid overlay. The format name and join code keep their
            original vertical labels in the side rail. */}
        <MatchModifierBadge modifiers={gameState.modifiers} />

        <Panel
          className="col-span-full h-full min-h-0 border-hidden overflow-visible bg-transparent pt-0 pb-0.5 px-0.5 backdrop-blur-none"
          style={{ backdropFilter: 'none' }}
        >
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,0.6fr)_minmax(0,6.1fr)_minmax(0,1.85fr)] gap-1 rounded-2xl px-0 pt-0 pb-0">
            <GameHandRow
              cards={topHandCards}
              rowRef={viewRefs.setTopHandRowRefs}
              getCardKey={(card) => card.instanceId}
              rowTestId="top-hand-row"
              rowClassName="h-[230%] -translate-y-[62%]"
              renderCard={(card) => {
                const revealedCard = card.isRevealed === true
                  ? (derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null)
                  : null

                return (
                  <div
                    key={`top-hand-${card.instanceId}`}
                    data-hand-instance-id={card.instanceId}
                    className="h-full w-full"
                  >
                    <FlippableCard
                      isFlipped={revealedCard !== null}
                      durationMs={340}
                      back={<CardBack className="h-full w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />}
                      front={
                        revealedCard ? (
                          <CardImage
                            card={revealedCard}
                            variant="board"
                            alt={revealedCard.displayName}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full rounded-md object-cover"
                          />
                        ) : null
                      }
                    />
                  </div>
                )
              }}
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
              isConnected={isConnected}
              isActionPending={isActionPending}
              isActionBlocked={isActionBlocked}
              isPresentationPending={isHolding}
              onSelectAction={submitMappedAction}
              onSelectAttackTarget={submitCardTargetSelection}
              onConfirmSummonTargetSelection={submitSummonTargetSelection}
              onConfirmEffectTargetSelection={submitEffectTargetSelection}
              onToggleTheme={toggleTheme}
              onForfeit={forfeitGame}
              onRequestRedo={requestRedo}
            />

            <BottomHandReorderRow
              cards={bottomHandCards}
              rowRef={viewRefs.setBottomHandRowRefs}
              cardById={derivedGameState.cardById}
              availableActions={mappedAvailableActions}
              faceUpByInstanceId={bottomHandFaceUpByInstanceId}
              isConnected={isConnected}
              isActionPending={isActionPending}
              onSelectCardActionOption={submitMappedAction}
              isEffectActionTargeting={isEffectActionTargeting}
              validEffectTargetsByCardId={validEffectTargetsByCardId}
              onChooseTarget={submitCardTargetSelection}
            />
          </div>
        </Panel>

        <GamePromptOverlay
          isOpen={shouldShowPromptOverlay}
          prompt={promptPresentation}
          candidateCards={buildPromptCandidateCards({
            prompt: promptPresentation,
            players,
            requestingPlayerId: authUserId,
            catalogCards: liveGameCards,
          })}
          isConnected={isConnected}
          isActionPending={isActionPending || isMulliganAnimationPending}
          onResolve={(selectedOption) => {
            void handlePromptResolve(selectedOption)
          }}
        />

        <PromptSelectionBanner
          promptKey={shouldShowPromptSelectionBanner ? gameState.pendingPrompt?.promptId ?? null : null}
          title={shouldShowPromptSelectionBanner ? promptPresentation?.title ?? null : null}
        />

        <RedoWaitingBanner
          isOpen={isWaitingForRedoAnswer}
          onCancel={cancelRedo}
        />

        <RedoConsentDialog
          isOpen={isAnsweringRedo}
          onRespond={async (accepted) => {
            if (!pendingRedo) {
              return false
            }

            return respondToRedo(pendingRedo.requestId, accepted)
          }}
        />

        <SupportChainBubble gameInstance={gameState} authUserId={authUserId} />

        <EffectNoticeBanner notices={gameState.effectNotices} />

        <ActionLog
          gameState={gameState}
          authUserId={authUserId}
          cardById={derivedGameState.cardById}
          isConnected={isConnected}
        />

        {gameOutcome && !isGameOverOverlayDismissed ? (
          <GameOverOverlay
            outcome={gameOutcome}
            authUserId={authUserId}
            onDismiss={dismissGameOverOverlay}
          />
        ) : null}

        {/* Once the result is off the board, leaving is still one click away - at the corner the overlay's own button
            used to occupy - so the finished position and the action log can be studied without losing the exit. Its
            z-index clears the expanded log's backdrop (z-[270]) and panel (z-[280]): review mode is exactly when the
            log gets expanded, and an exit that the panel buries would contradict the point of staying. */}
        {gameOutcome && isGameOverOverlayDismissed ? (
          <button
            type="button"
            data-testid="game-over-review-return-button"
            onClick={() => {
              void navigate('/')
            }}
            className="fixed left-2 top-2 z-[290] inline-flex items-center gap-1 rounded-lg border border-white/25 bg-slate-950/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_12px_30px_rgba(0,0,0,0.55)] backdrop-blur-sm transition-[filter] hover:brightness-125"
          >
            <ArrowLeft size={12} strokeWidth={2.5} />
            {t('game.outcome.returnToMainPage')}
          </button>
        ) : null}

        {actionError ? (
          <div
            data-testid="game-action-error-banner"
            role="alert"
            className="fixed left-1/2 top-2 z-50 flex max-w-[92vw] -translate-x-1/2 items-start gap-2 rounded-lg border border-red-500/70 bg-black/85 px-3 py-2 text-[11px] font-semibold leading-tight text-white shadow-lg"
          >
            <span className="min-w-0 flex-1 break-words">{actionError}</span>
            <button
              type="button"
              aria-label={t('game.view.dismissErrorAria')}
              onClick={() => setActionError(null)}
              className="inline-flex shrink-0 items-center justify-center rounded border border-white/30 px-1.5 leading-none text-white/85 transition-[filter] hover:brightness-125"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
        ) : null}

      </div>
      </MotionConfig>
    </PageShell>
  )
}

