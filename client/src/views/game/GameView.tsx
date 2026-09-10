import { useGameCardsQuery } from '@/services/queries/cardQueries'
import { useMemo, useState } from 'react'
import { useLoaderData } from 'react-router-dom'
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
import type { IAttackTargetingState, IGameLoaderData, ISummonTargetingState } from '@/views/game/types'
import type { IGameActionOptionResponse } from '@/services/api/types/game'
import { BottomHandReorderRow, GameHandRow, GamePromptOverlay, GameZones } from '@/views/game/components'
import {
  GAMEBOARD_MAX_WIDTH_CLASS,
  GAMEBOARD_COLUMNS_CLASS,
  LEADER_CARD_FRAME_CLASS,
} from '@/views/game/utils/contants'
import { handlePromptResolve as resolvePromptAction, submitCardTargetSelection as submitCardTargetAction, submitMappedAction as submitMappedGameAction, submitSetSupportToSlot as submitSetSupportAction, submitSummonTargetSelection as submitSummonTargetAction } from '@/views/game/utils/functions'
import { CardBack } from '@/components/ui/cards'
import { useGameUIStore } from '@/state/gameUIStore'
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
  useOccupiedSupportSlots,
  usePassLikeAction,
  useGameCardsBackfill,
  useGameViewSideEffects
} from '@/views/game/hooks'

export function GameView() {
  const { joinCode, gameCards, gameState: initialGameState } = useLoaderData() as IGameLoaderData
  const authUserId = useAuthSessionStore((state) => state.session?.userId)
  const toggleTheme = useThemeStore((state) => state.toggleTheme)

  const battlefieldDisplayOrderStorageKey = useGetBattlefieldDisplayOrderStorageKey(authUserId!, joinCode)

  const viewRefs = useGameRefs()
  const animControllerRef = useGameAnimationController()
  const ui = useGameUIStore()
  const {
    bottomHandFaceUpByInstanceId,
    isMulliganAnimationPending,
    setIsMulliganAnimationPending,
    pendingSetSupportCardInstanceId,
    setPendingSetSupportCardInstanceId,
    pendingCardTargeting,
    setPendingCardTargeting,
    pendingSummonTargeting,
    setPendingSummonTargeting,
    setOptimisticRestedByInstanceId,
    setActiveAttackLink,
  } = ui
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
  } = gameHubState
  const setActionError = useGameHubStore((state) => state.setActionError)

  usePersistedBattlefieldDisplayOrderEffect(battlefieldDisplayOrderStorageKey, topBattlefieldDisplayOrder, bottomBattlefieldDisplayOrder)

  const players = gameState.players
  useGameCardsBackfill({ players, liveGameCards, gameCardsQuery })

  const derivedGameState = useDerivedGameViewState(liveGameCards, players, authUserId)
  const { topLeaderCard, bottomLeaderCard } = derivedGameState

  const occupiedBottomSupportSlots = useOccupiedSupportSlots({ derivedGameState })

  const topHandCards = useMemo(() => derivedGameState.opponentPlayer?.hand ?? [], [derivedGameState.opponentPlayer?.hand])
  const bottomHandCards = useMemo(() => derivedGameState.currentPlayer?.hand ?? [], [derivedGameState.currentPlayer?.hand])

  const currentTopBattlefieldRawCards = useCurrentBattlefieldRawCards(derivedGameState.opponentPlayer)
  const currentBottomBattlefieldRawCards = useCurrentBattlefieldRawCards(derivedGameState.currentPlayer)

  const topBattlefieldCards = useBattlefieldCards(topBattlefieldDisplayOrder, currentTopBattlefieldRawCards)
  const bottomBattlefieldCards = useBattlefieldCards(bottomBattlefieldDisplayOrder, currentBottomBattlefieldRawCards)

  const topLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(topLeaderCard))
  const bottomLeaderCardFrameClassName = buildLeaderCardFrameClass(LEADER_CARD_FRAME_CLASS, Boolean(bottomLeaderCard))

  const isEffectActionTargeting = pendingCardTargeting?.kind === 'effect'
  const validEffectTargetsByCardId = useMemo(
    () => (isEffectActionTargeting ? extractTargetIds(pendingCardTargeting?.validTargets) : new Set<string>()),
    [isEffectActionTargeting, pendingCardTargeting],
  )

  const promptPresentation = toPromptPresentation(gameState.pendingPrompt)

  const shouldShowPromptOverlay =
    promptPresentation?.renderAsOverlay === true && promptPresentation.isAwaitingRequestingPlayer
  const canResolvePrompt = gameState.pendingPrompt?.isAwaitingRequestingPlayer ?? false

  const mappedAvailableActions = shouldShowPromptOverlay
    ? gameState.availableActions.filter((action) => !action.actionId.startsWith('resolve-prompt:'))
    : gameState.availableActions

  const canShowHandNoActionsMessage =
    Boolean(authUserId)
    && gameState.phase === 'MainPhase'
    && gameState.activePlayerId.trim().toLowerCase() === authUserId?.trim().toLowerCase()
    && !gameState.pendingPrompt

  useGameViewSideEffects({
    authUserId,
    gameState,
    gameHubState,
    ui,
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

  const passLikeAction = usePassLikeAction({ mappedAvailableActions })

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

  function beginSummonTargeting(targeting: ISummonTargetingState): void {
    setPendingSetSupportCardInstanceId(null)
    setPendingCardTargeting(null)
    setActiveAttackLink(null)
    setPendingSummonTargeting(targeting)
  }

  const gameActionDeps = {
    ...viewRefs,
    animControllerRef,
    submitHubIntent,
    getCardActionTargets,
    canResolvePrompt,
    promptPresentation,
    bottomHandCards,
    occupiedBottomSupportSlots,
    mappedAvailableActions,
    currentBottomBattlefieldRawCards,
    setBottomBattlefieldDisplayOrder,
    pendingSetSupportCardInstanceId,
    setPendingSetSupportCardInstanceId,
    pendingCardTargeting,
    setPendingCardTargeting,
    pendingSummonTargeting,
    setPendingSummonTargeting,
    setOptimisticRestedByInstanceId,
    setActiveAttackLink,
    setIsMulliganAnimationPending,
    setLastSubmittedAttackSourceInstanceId,
    characterFieldCards: derivedGameState.currentPlayer?.characterField ?? [],
    beginBattleTargeting,
    beginEffectTargeting,
    beginSummonTargeting,
  }

  function submitSummonTargetSelection(): void {
    submitSummonTargetAction(gameActionDeps)
  }

  function submitCardTargetSelection(targetCardInstanceId: string): void {
    submitCardTargetAction({ ...gameActionDeps, targetCardInstanceId })
  }

  function submitMappedAction(action: IGameActionOptionResponse): void {
    submitMappedGameAction({ ...gameActionDeps, action })
  }

  function submitSetSupportToSlot(slotIndex: number): void {
    submitSetSupportAction({ ...gameActionDeps, slotIndex })
  }

  function handlePassLikeAction(): void {
    if (!passLikeAction || !passLikeAction.isEnabled) {
      return
    }

    submitMappedAction(passLikeAction)
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
              isConnected={isConnected}
              isActionPending={isActionPending}
              onSelectAction={submitMappedAction}
              onSelectSupportSlotForSet={submitSetSupportToSlot}
              onSelectAttackTarget={submitCardTargetSelection}
              onConfirmSummonTargetSelection={submitSummonTargetSelection}
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
              isEffectActionTargeting={isEffectActionTargeting}
              validEffectTargetsByCardId={validEffectTargetsByCardId}
              onChooseTarget={submitCardTargetSelection}
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

        {actionError ? (
          <div
            data-testid="game-action-error-banner"
            role="alert"
            className="fixed left-1/2 top-2 z-50 flex max-w-[92vw] -translate-x-1/2 items-start gap-2 rounded-lg border border-red-500/70 bg-black/85 px-3 py-2 text-[11px] font-semibold leading-tight text-white shadow-lg"
          >
            <span className="min-w-0 flex-1 break-words">{actionError}</span>
            <button
              type="button"
              aria-label="Dismiss error"
              onClick={() => setActionError(null)}
              className="shrink-0 rounded border border-white/30 px-1.5 leading-none text-white/85 transition-[filter] hover:brightness-125"
            >
              ×
            </button>
          </div>
        ) : null}

      </div>
    </PageShell>
  )
}

