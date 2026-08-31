import { Lightbulb, RotateCcw, ScrollText, SkipForward } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AppButton } from '@/components/ui'
import { CardBack, CardImage, LeaderCard } from '@/components/ui/cards'
import { PlayBottomResourceZone, PlayCard, PlayPileZone, PlayTopResourceZone } from '@/components/ui/game'
import { twMerge } from 'tailwind-merge'
import type { IGameZonesProps } from '@/views/game/types/gameZones'
import { LEADER_CARD_IMAGE_CLASS } from '@/views/game/utils/contants'
import { GamePhaseActionRow } from '@/views/game/components/GamePhaseActionRow'
import { NonLeaderCardOverlay } from '@/views/game/components/NonLeaderCardOverlay'
import { resolveCardActionOptionsForInstanceId, resolveNonLeaderCards } from '@/views/game/utils/functions/cards'

function GameZones({
  boardZoneRef,
  joinCode,
  derivedGameState,
  topBattlefieldCardsOverride,
  bottomBattlefieldCardsOverride,
  topDeckCardRef,
  bottomDeckCardRef,
  topTrashCardRef,
  bottomTrashCardRef,
  topLeaderCardFrameClassName,
  bottomLeaderCardFrameClassName,
  gameState,
  authUserId,
  availableActions,
  pendingSetSupportCardInstanceId,
  pendingAttackTargeting,
  optimisticRestedByInstanceId,
  activeAttackLink,
  isBattleActionTargeting,
  isConnected,
  isActionPending,
  onSelectAction,
  onSelectSupportSlotForSet,
  onCancelSetSupportSelection,
  onSelectAttackTarget,
  onCancelAttackTargetSelection,
  onToggleTheme,
  onPassTurn,
}: IGameZonesProps) {
  const { topLeaderCard, bottomLeaderCard } = derivedGameState
  const topSupportCards = resolveNonLeaderCards(
    derivedGameState.opponentPlayer?.supportZone ?? [],
    derivedGameState.cardTypeById,
    derivedGameState.cardById,
  )
  const topBattlefieldCards = resolveNonLeaderCards(
    topBattlefieldCardsOverride ?? derivedGameState.opponentPlayer?.characterField ?? [],
    derivedGameState.cardTypeById,
    derivedGameState.cardById,
  )
  const bottomSupportCards = resolveNonLeaderCards(
    derivedGameState.currentPlayer?.supportZone ?? [],
    derivedGameState.cardTypeById,
    derivedGameState.cardById,
  )
  const bottomBattlefieldCards = resolveNonLeaderCards(
    bottomBattlefieldCardsOverride ?? derivedGameState.currentPlayer?.characterField ?? [],
    derivedGameState.cardTypeById,
    derivedGameState.cardById,
  )
  const topLeaderActionOptions = topLeaderCard
    ? resolveCardActionOptionsForInstanceId(
      availableActions,
      topLeaderCard.instanceId,
      topLeaderCard.availableActions,
    )
    : []
  const bottomLeaderActionOptions = bottomLeaderCard
    ? resolveCardActionOptionsForInstanceId(
      availableActions,
      bottomLeaderCard.instanceId,
      bottomLeaderCard.availableActions,
    )
    : []

  const [attackLinkPath, setAttackLinkPath] = useState<string | null>(null)
  const [attackLinkViewBox, setAttackLinkViewBox] = useState<string>('0 0 1 1')
  const attackLinkMarkerId = `attack-link-arrow-${joinCode}`

  const validBattleTargetsByCardId = useMemo(() => {
    const targets = pendingAttackTargeting?.validTargets ?? []
    const targetIds = new Set<string>()
    for (const target of targets) {
      targetIds.add(target.cardInstanceId.trim().toLowerCase())
    }

    return targetIds
  }, [pendingAttackTargeting])

  const isTopLeaderBattleTarget = useMemo(() => {
    if (!topLeaderCard) {
      return false
    }

    return validBattleTargetsByCardId.has(topLeaderCard.instanceId.trim().toLowerCase())
  }, [topLeaderCard, validBattleTargetsByCardId])

  const isBottomLeaderBattleTarget = useMemo(() => {
    if (!bottomLeaderCard) {
      return false
    }

    return validBattleTargetsByCardId.has(bottomLeaderCard.instanceId.trim().toLowerCase())
  }, [bottomLeaderCard, validBattleTargetsByCardId])

  const topSupportCardsBySlotIndex = useMemo(() => {
    const cardsBySlot = new Map<number, ReturnType<typeof resolveNonLeaderCards>[number]>()
    for (const [currentIndex, card] of topSupportCards.entries()) {
      const resolvedSlotIndex = typeof card.supportSlotIndex === 'number'
        ? card.supportSlotIndex
        : currentIndex

      if (resolvedSlotIndex >= 0 && resolvedSlotIndex < 5) {
        cardsBySlot.set(resolvedSlotIndex, card)
      }
    }

    return cardsBySlot
  }, [topSupportCards])

  const bottomSupportCardsBySlotIndex = useMemo(() => {
    const cardsBySlot = new Map<number, ReturnType<typeof resolveNonLeaderCards>[number]>()
    for (const [currentIndex, card] of bottomSupportCards.entries()) {
      const resolvedSlotIndex = typeof card.supportSlotIndex === 'number'
        ? card.supportSlotIndex
        : currentIndex

      if (resolvedSlotIndex >= 0 && resolvedSlotIndex < 5) {
        cardsBySlot.set(resolvedSlotIndex, card)
      }
    }

    return cardsBySlot
  }, [bottomSupportCards])

  useEffect(() => {
    if (!activeAttackLink || !boardZoneRef.current) {
      setAttackLinkPath(null)
      return
    }

    const boardElement = boardZoneRef.current

    const computePath = () => {
      if (!boardElement || !activeAttackLink) {
        setAttackLinkPath(null)
        return
      }

      const sourceCard = boardElement.querySelector<HTMLElement>(
        `[data-zone="character-field-card"][data-card-instance-id="${activeAttackLink.sourceCardInstanceId}"]`,
      )

      const targetCard = boardElement.querySelector<HTMLElement>(
        `[data-card-instance-id="${activeAttackLink.targetCardInstanceId}"]`,
      )

      if (!sourceCard || !targetCard) {
        setAttackLinkPath(null)
        return
      }

      const boardRect = boardElement.getBoundingClientRect()
      setAttackLinkViewBox(`0 0 ${Math.max(1, boardRect.width)} ${Math.max(1, boardRect.height)}`)
      const sourceRect = sourceCard.getBoundingClientRect()
      const targetRect = targetCard.getBoundingClientRect()
      const sourceX = sourceRect.left - boardRect.left + sourceRect.width * 0.5
      const sourceY = sourceRect.top - boardRect.top + sourceRect.height * 0.5
      const targetX = targetRect.left - boardRect.left + targetRect.width * 0.5
      const targetY = targetRect.top - boardRect.top + targetRect.height * 0.5
      const curveOffset = Math.max(36, Math.abs(targetY - sourceY) * 0.2)

      setAttackLinkPath(`M ${sourceX} ${sourceY} C ${sourceX} ${sourceY + curveOffset}, ${targetX} ${targetY - curveOffset}, ${targetX} ${targetY}`)
    }

    computePath()
    window.addEventListener('resize', computePath)

    return () => {
      window.removeEventListener('resize', computePath)
    }
  }, [activeAttackLink, boardZoneRef, topBattlefieldCards, bottomBattlefieldCards, topLeaderCard, bottomLeaderCard])

  function renderZoneCardSlots(
    cards: ReturnType<typeof resolveNonLeaderCards>,
    zone: 'support',
    visibilityMode: 'hover',
    isCurrentPlayerZone: boolean,
  ) {
    return (
      <div className="grid min-h-0 w-full overflow-hidden grid-cols-5 justify-items-center gap-1.5">
        {Array.from({ length: 5 }).map((_, index) => {
          const card = zone === 'support'
            ? (isCurrentPlayerZone
              ? (bottomSupportCardsBySlotIndex.get(index) ?? null)
              : (topSupportCardsBySlotIndex.get(index) ?? null))
            : (cards[index] ?? null)
          const isSelectionSlot = isCurrentPlayerZone
            && pendingSetSupportCardInstanceId !== null
            && card === null

          const isSelectionBlocked = isCurrentPlayerZone
            && pendingSetSupportCardInstanceId !== null
            && !isSelectionSlot

          if (!card) {
            return (
              <button
                key={`${zone}-empty-${index}`}
                type="button"
                data-zone={zone}
                data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
                data-slot-index={index}
                disabled={!isSelectionSlot}
                onClick={
                  isSelectionSlot
                    ? () => onSelectSupportSlotForSet(index)
                    : undefined
                }
                className={twMerge(
                  'h-full rounded-lg',
                  !isSelectionSlot ? 'cursor-default' : 'cursor-pointer',
                )}
              >
                <PlayCard
                  data-zone={zone}
                  data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
                  data-slot-index={index}
                  data-slot-card="true"
                  className={twMerge(
                    'h-full rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)]',
                    isSelectionBlocked ? 'opacity-45' : '',
                    isSelectionSlot ? 'border-amber-400/90 bg-amber-300/20' : '',
                  )}
                />
              </button>
            )
          }

          const actionOptions = resolveCardActionOptionsForInstanceId(
            availableActions,
            card.instanceId,
            card.availableActions,
          )
          const isBattleTarget = validBattleTargetsByCardId.has(card.instanceId.trim().toLowerCase())
          const isCardRested = card.isRested || card.isExhausted || optimisticRestedByInstanceId[card.instanceId] === true
          const isOwnConcealedSupportCard = zone === 'support' && isCurrentPlayerZone && card.isConcealedFromOpponent === true
          const isConcealedSupportCard = zone === 'support' && !isCurrentPlayerZone && !card.isFaceUp
          const shouldHideOverlayDetails = isConcealedSupportCard

          return (
            <PlayCard
              key={`${zone}-${card.instanceId}`}
              data-zone={zone}
              data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
              data-slot-index={index}
              data-card-instance-id={card.instanceId}
              data-slot-card="true"
              className={twMerge(
                'group relative h-full overflow-hidden rounded-lg bg-[var(--surface-elevated)]',
                zone === 'support' ? 'border-transparent' : 'border border-[var(--border-subtle)]',
                isCardRested ? 'opacity-80 saturate-75' : '',
                isSelectionBlocked ? 'opacity-45' : '',
                isBattleTarget ? 'ring-2 ring-amber-400/90 ring-offset-1 ring-offset-transparent' : '',
              )}
              onClick={isBattleTarget ? () => onSelectAttackTarget(card.instanceId) : undefined}
            >
              {card.isFaceUp ? (
                <CardImage
                  src={card.image}
                  alt={card.displayName}
                  loading="lazy"
                  decoding="async"
                  className={LEADER_CARD_IMAGE_CLASS}
                />
              ) : (
                <CardBack className="h-full w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-elevated)]" />
              )}

              {isConcealedSupportCard ? (
                <div className="pointer-events-none absolute inset-0 z-10 rounded-lg bg-black/18" />
              ) : null}

              {isOwnConcealedSupportCard ? (
                <div
                  className="pointer-events-none absolute inset-0 z-10 rounded-lg"
                  style={{
                    backgroundImage: 'repeating-linear-gradient(135deg, rgba(203, 213, 225, 0.46) 0px, rgba(203, 213, 225, 0.46) 7px, rgba(15, 23, 42, 0.06) 7px, rgba(15, 23, 42, 0.06) 15px)',
                    backgroundColor: 'rgba(51, 65, 85, 0.12)',
                  }}
                />
              ) : null}

              {!shouldHideOverlayDetails ? (
                <NonLeaderCardOverlay
                  previewCard={card.isFaceUp ? (derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null) : null}
                  zone={zone}
                  visibilityMode={visibilityMode}
                  actionOptions={actionOptions}
                  showEmptyActionMessage={isCurrentPlayerZone}
                  suppressActionFallback={!isCurrentPlayerZone}
                  isConnected={isConnected}
                  isActionPending={isActionPending}
                  onSelectActionOption={(actionId) => {
                    const selectedAction = actionOptions.find((action) => action.actionId === actionId)
                    if (!selectedAction) {
                      return
                    }

                    onSelectAction(selectedAction)
                  }}
                />
              ) : null}
            </PlayCard>
          )
        })}
      </div>
    )
  }

  function renderBattlefieldRow(
    cards: ReturnType<typeof resolveNonLeaderCards>,
    isCurrentPlayerZone: boolean,
  ) {
    return (
      <div
        data-zone="character-field-row"
        data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
        className="flex h-full min-h-0 w-full items-center justify-start gap-2.5 overflow-visible rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5"
      >
        {cards.map((card, index) => {
          const actionOptions = resolveCardActionOptionsForInstanceId(
            availableActions,
            card.instanceId,
            card.availableActions,
          )
          const isBattleTarget = validBattleTargetsByCardId.has(card.instanceId.trim().toLowerCase())
          const isCardRested = card.isRested || card.isExhausted || optimisticRestedByInstanceId[card.instanceId] === true

          return (
            <PlayCard
              key={`character-field-${card.instanceId}`}
              data-zone="character-field-card"
              data-slot-side={isCurrentPlayerZone ? 'bottom' : 'top'}
              data-slot-index={index}
              data-card-instance-id={card.instanceId}
              className={twMerge(
                'group relative h-full shrink-0 overflow-hidden rounded-lg bg-[var(--surface-elevated)] transition-transform duration-300 ease-out will-change-transform origin-center',
                isCardRested ? 'opacity-80 saturate-75 rotate-[14deg]' : 'rotate-0',
                isBattleTarget ? 'ring-2 ring-amber-400/90 ring-offset-1 ring-offset-transparent' : '',
              )}
              onClick={isBattleTarget ? () => onSelectAttackTarget(card.instanceId) : undefined}
            >
              {card.isFaceUp ? (
                <CardImage
                  src={card.image}
                  alt={card.displayName}
                  loading="lazy"
                  decoding="async"
                  className={LEADER_CARD_IMAGE_CLASS}
                />
              ) : (
                <CardBack className="h-full w-full rounded-lg bg-[var(--surface-elevated)]" />
              )}

              <NonLeaderCardOverlay
                previewCard={derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null}
                zone="character-field"
                visibilityMode="hover"
                actionOptions={actionOptions}
                showEmptyActionMessage={isCurrentPlayerZone}
                suppressActionFallback={!isCurrentPlayerZone}
                isConnected={isConnected}
                isActionPending={isActionPending}
                onSelectActionOption={(actionId) => {
                  const selectedAction = actionOptions.find((action) => action.actionId === actionId)
                  if (!selectedAction) {
                    return
                  }

                  onSelectAction(selectedAction)
                }}
              />
            </PlayCard>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid min-h-0 grid-cols-[1fr_1.5rem] gap-0.5">
      <div
        ref={boardZoneRef}
        data-testid="game-board"
        className="relative grid min-h-0 overflow-hidden grid-rows-[1fr_1fr_auto_1fr_1fr] gap-1 rounded-2xl border border-dashed border-[var(--border-subtle)] p-0.5 turn-zone-split"
      >
        {attackLinkPath ? (
          <svg
            className="pointer-events-none absolute inset-0 z-30 h-full w-full"
            viewBox={attackLinkViewBox}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <marker
                id={attackLinkMarkerId}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(251, 146, 60, 0.95)" />
              </marker>
            </defs>
            <path d={attackLinkPath} stroke="rgba(251, 146, 60, 0.95)" strokeWidth="3" fill="none" markerEnd={`url(#${attackLinkMarkerId})`} className="attack-link-path" />
          </svg>
        ) : null}

        <div className="row-span-2 grid min-h-0 grid-cols-[var(--resource-rail-max-width)_minmax(0,1fr)_var(--resource-rail-max-width)] gap-1 rounded-xl p-0.5">
          <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
            <PlayPileZone
              side="top"
              labels={['Deck', 'Trash']}
              cardBackTone="blue"
              gameState={derivedGameState}
              deckCardRef={topDeckCardRef}
              trashCardRef={topTrashCardRef}
            />
            <PlayTopResourceZone
              isSummonCardReady={derivedGameState.opponentPlayer?.isSummonCardReady ?? true}
            />
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-2">
            {renderZoneCardSlots(topSupportCards, 'support', 'hover', false)}
            {renderBattlefieldRow(topBattlefieldCards, false)}
          </div>

          <div className="flex min-h-0 w-full justify-end">
            <div
              data-card-instance-id={topLeaderCard?.instanceId}
              data-zone="leader-card"
              data-slot-side="top"
              onClick={isTopLeaderBattleTarget && topLeaderCard ? () => onSelectAttackTarget(topLeaderCard.instanceId) : undefined}
              className={twMerge(
                topLeaderCardFrameClassName,
                isTopLeaderBattleTarget ? 'cursor-pointer ring-2 ring-amber-400/90 ring-offset-1 ring-offset-transparent' : '',
              )}
            >
              <LeaderCard
                className="h-full"
                imageClassName={LEADER_CARD_IMAGE_CLASS}
                leaderCard={topLeaderCard}
                previewCard={topLeaderCard ? (derivedGameState.cardById.get(topLeaderCard.cardDefinitionId.trim().toLowerCase()) ?? null) : null}
                showBadgeWhenLifeMissing
                actionOptions={topLeaderActionOptions}
                isConnected={isConnected}
                isActionPending={isActionPending}
                onSelectActionOption={(actionId) => {
                  const selectedAction = topLeaderActionOptions.find((action) => action.actionId === actionId)
                  if (!selectedAction) {
                    return
                  }

                  onSelectAction(selectedAction)
                }}
              />
            </div>
          </div>
        </div>

        <div className="my-0.5">
          <GamePhaseActionRow
            gameInstance={gameState}
            authUserId={authUserId}
            availableActions={availableActions}
            isConnected={isConnected}
            isActionPending={isActionPending}
            onSelectAction={onSelectAction}
            phaseTestId="phase-indicator"
          />
        </div>

        <div className="row-span-2 grid min-h-0 grid-cols-[var(--resource-rail-max-width)_minmax(0,1fr)_var(--resource-rail-max-width)] gap-1 rounded-xl p-0.5">
          <div className="min-h-0 w-full">
            <div
              data-card-instance-id={bottomLeaderCard?.instanceId}
              data-zone="leader-card"
              data-slot-side="bottom"
              onClick={isBottomLeaderBattleTarget && bottomLeaderCard ? () => onSelectAttackTarget(bottomLeaderCard.instanceId) : undefined}
              className={twMerge(
                bottomLeaderCardFrameClassName,
                isBottomLeaderBattleTarget ? 'cursor-pointer ring-2 ring-amber-400/90 ring-offset-1 ring-offset-transparent' : '',
              )}
            >
              <LeaderCard
                className="h-full"
                imageClassName={LEADER_CARD_IMAGE_CLASS}
                leaderCard={bottomLeaderCard}
                previewCard={bottomLeaderCard ? (derivedGameState.cardById.get(bottomLeaderCard.cardDefinitionId.trim().toLowerCase()) ?? null) : null}
                actionOptions={bottomLeaderActionOptions}
                isConnected={isConnected}
                isActionPending={isActionPending}
                onSelectActionOption={(actionId) => {
                  const selectedAction = bottomLeaderActionOptions.find((action) => action.actionId === actionId)
                  if (!selectedAction) {
                    return
                  }

                  onSelectAction(selectedAction)
                }}
              />
            </div>
          </div>

          <div className="grid min-h-0 grid-rows-[minmax(0,1.05fr)_minmax(0,0.95fr)] gap-2">
            {renderBattlefieldRow(bottomBattlefieldCards, true)}
            {renderZoneCardSlots(bottomSupportCards, 'support', 'hover', true)}
          </div>

          <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-1">
            <PlayBottomResourceZone
              isSummonCardReady={derivedGameState.currentPlayer?.isSummonCardReady ?? true}
            />
            <PlayPileZone
              side="bottom"
              labels={['Trash', 'Deck']}
              cardBackTone="orange"
              gameState={derivedGameState}
              deckCardRef={bottomDeckCardRef}
              trashCardRef={bottomTrashCardRef}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end justify-center gap-1">
        {joinCode ? (
          <div
            data-testid="game-join-code"
            className="mb-1 px-0.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)] opacity-[0.45] [writing-mode:vertical-rl] rotate-180"
          >
            {joinCode}
          </div>
        ) : null}

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            data-testid="theme-toggle-button"
            onClick={onToggleTheme}
            aria-label="Toggle light and dark mode"
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <Lightbulb size={10} />
          </AppButton>
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            Toggle Theme
          </span>
        </div>

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            data-testid="pass-turn-button"
            aria-label="Pass turn"
            onClick={onPassTurn}
            disabled={!isConnected || isActionPending}
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <SkipForward size={10} />
          </AppButton>
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            Do Nothing / Pass
          </span>
        </div>

        {pendingSetSupportCardInstanceId ? (
          <div className="group relative">
            <AppButton
              type="button"
              variant="ghost"
              aria-label="Cancel support slot selection"
              onClick={onCancelSetSupportSelection}
              className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
            >
              <span className="text-[10px] font-bold leading-none">X</span>
            </AppButton>
            <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
              Cancel Set Support
            </span>
          </div>
        ) : null}

        {isBattleActionTargeting ? (
          <div className="group relative">
            <AppButton
              type="button"
              variant="ghost"
              aria-label="Cancel attack target selection"
              onClick={onCancelAttackTargetSelection}
              className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
            >
              <span className="text-[10px] font-bold leading-none">X</span>
            </AppButton>
            <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
              Cancel Attack Target
            </span>
          </div>
        ) : null}

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            aria-label="Undo action"
            disabled={!isConnected || isActionPending}
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <RotateCcw size={10} />
          </AppButton>
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            Undo Action
          </span>
        </div>

        <div className="group relative">
          <AppButton
            type="button"
            variant="ghost"
            aria-label="Open log"
            disabled={!isConnected || isActionPending}
            className="h-5 w-5 min-w-0 rounded-md bg-[var(--surface-muted)] px-0 py-0 text-[var(--text-primary)]"
          >
            <ScrollText size={10} />
          </AppButton>
          <span className="pointer-events-none absolute right-full top-1/2 mr-1.5 hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--text-primary)] shadow-sm group-hover:block">
            Open Log
          </span>
        </div>
      </div>
    </div>
  )
}

export { GameZones }