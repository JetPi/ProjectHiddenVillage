import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react'
import { useGameHubStore } from '@/state/gameHubStore'
import { preloadCardArtInPriorityBatches, type ICardArtPreloadEntry } from '@/services/cardPreloadService'
import { preloadImageSources } from '@/services/imagePreloadCache'
import { CARD_ART_WIDTHS } from '@/services/api/cardArt'
import type { IGameStateResponse, IGamePlayerStateResponse } from '@/services/api/types/game'
import chakraCardImage from '@/assets/ChakraCard.webp'
import summonCardImage from '@/assets/SummonCard.webp'
import cardBackImage from '@/assets/CardBackside.webp'
import type {
  IGameLoaderData,
  IPlayerCardZoneInstanceIds,
  IRevalidatorState,
  IUseAutoAdvancePhaseEffectArgs,
  IUseCardMoveGhostAnimationEffectArgs,
  IUseHandZoneAnimationEffectsArgs,
  IUseRevealedCardSummonFlightEffectArgs,
} from '@/views/game/types'
import {
  runCardImageGhostToElementAnimation,
  runDeckToHandAnimation,
  runRectToDynamicElementAnimation,
} from '@/views/game/utils/functions'
const STATIC_GAME_IMAGE_SOURCES = [chakraCardImage, summonCardImage, cardBackImage]
const AUTO_SIGNAL_PHASES = new Set([
  'DrawInitialHand',
  'RefreshPhase',
  'StartOfMainPhase',
  'DrawPhase',
  'AttackResolution',
  'BattleEndStep',
  'EndStep',
])
const DECK_TO_HAND_FLY_DURATION_MS = 420
const DRAW_ANIMATION_COMPLETE_PADDING_MS = 140
const CARD_TO_TRASH_FLY_DURATION_MS = 340
const CARD_TO_TRASH_STAGGER_MS = 90
// A revealed card summoned straight out of the deck travels the same route a hand→field summon does.
const REVEAL_SUMMON_FLIGHT_DURATION_MS = 360
const AUTO_ADVANCE_RECHECK_MS = 80
const AUTO_ADVANCE_RETRY_DELAY_MS = 2_500
const AUTO_ADVANCE_MAX_RETRIES = 3

/**
 * Where a card was rendered when the last snapshot was taken, so its exit can start from the exact spot
 * it disappeared from (the game state that removed it already re-rendered the board by then).
 */
type ICardRenderedZone = 'battlefield' | 'support' | 'hand'

type ICardGhostSnapshot = {
  imageSrc: string
  rect: DOMRect
  side: 'top' | 'bottom'
  zone: ICardRenderedZone
}

type ICardCurrentLocation = {
  zone: ICardRenderedZone | 'trash' | 'deck' | 'exile'
  side: 'top' | 'bottom'
}

function resolveRenderedZone(element: HTMLElement, fallbackZone: ICardRenderedZone): ICardRenderedZone {
  if (element.dataset.zone === 'character-field-card') {
    return 'battlefield'
  }

  if (element.dataset.zone === 'support') {
    return 'support'
  }

  return fallbackZone
}

function collectCardGhostSnapshots(
  root: HTMLElement | null,
  selector: string,
  fallbackSide: 'top' | 'bottom',
  fallbackZone: ICardRenderedZone,
  snapshots: Map<string, ICardGhostSnapshot>,
): void {
  if (!root) {
    return
  }

  const elements = root.querySelectorAll<HTMLElement>(selector)
  for (const element of elements) {
    const instanceId = element.dataset.cardInstanceId ?? element.dataset.handInstanceId
    if (!instanceId || snapshots.has(instanceId)) {
      continue
    }

    const imageElement = element.querySelector<HTMLImageElement>('img')
    const rect = element.getBoundingClientRect()
    if (!imageElement || rect.width <= 0 || rect.height <= 0) {
      continue
    }

    snapshots.set(instanceId, {
      imageSrc: imageElement.currentSrc || imageElement.src,
      rect,
      side: element.dataset.slotSide === 'top' ? 'top' : element.dataset.slotSide === 'bottom' ? 'bottom' : fallbackSide,
      zone: resolveRenderedZone(element, fallbackZone),
    })
  }
}

/**
 * Snapshots every card face currently rendered on the board (character field + support slots) and in the
 * hand rows, keyed by instance id. The maps handed to the move effect are always one render behind, which
 * is what makes a disappearing card's geometry recoverable.
 */
function snapshotRenderedCardGhosts({
  boardZoneRef,
  topHandRowRef,
  bottomHandRowRef,
}: Pick<IUseCardMoveGhostAnimationEffectArgs, 'boardZoneRef' | 'topHandRowRef' | 'bottomHandRowRef'>): Map<string, ICardGhostSnapshot> {
  const snapshots = new Map<string, ICardGhostSnapshot>()

  collectCardGhostSnapshots(boardZoneRef.current, '[data-zone="character-field-card"][data-card-instance-id]', 'bottom', 'battlefield', snapshots)
  collectCardGhostSnapshots(boardZoneRef.current, '[data-zone="support"][data-card-instance-id]', 'bottom', 'support', snapshots)
  collectCardGhostSnapshots(topHandRowRef.current, '[data-hand-instance-id]', 'top', 'hand', snapshots)
  collectCardGhostSnapshots(bottomHandRowRef.current, '[data-hand-instance-id]', 'bottom', 'hand', snapshots)

  return snapshots
}

function buildZoneInstanceIdSets(instanceIds: IPlayerCardZoneInstanceIds): Record<ICardRenderedZone | 'trash', Set<string>> {
  return {
    battlefield: new Set(instanceIds.characterField),
    support: new Set(instanceIds.supportZone),
    hand: new Set(instanceIds.hand),
    trash: new Set(instanceIds.trash),
  }
}

/**
 * Where the card is right now, per the authoritative game state. `null` means the card is not in a zone the
 * board renders (deck/exile), which is never animated.
 */
function resolveCardCurrentLocation(
  instanceId: string,
  topZones: Record<ICardRenderedZone | 'trash', Set<string>>,
  bottomZones: Record<ICardRenderedZone | 'trash', Set<string>>,
): ICardCurrentLocation | null {
  const sides: Array<{ side: 'top' | 'bottom'; zones: Record<ICardRenderedZone | 'trash', Set<string>> }> = [
    { side: 'bottom', zones: bottomZones },
    { side: 'top', zones: topZones },
  ]

  for (const { side, zones } of sides) {
    for (const zone of ['trash', 'hand', 'battlefield', 'support'] as const) {
      if (zones[zone].has(instanceId)) {
        return { zone, side }
      }
    }
  }

  return null
}

/**
 * The element the ghost flies into. A returned card lands on its own freshly rendered hand card (so the
 * flight ends exactly on it); anything else aims at the destination pile/row.
 */
function resolveMoveGhostDestinationElement({
  instanceId,
  location,
  topHandRowRef,
  bottomHandRowRef,
  topTrashCardRef,
  bottomTrashCardRef,
}: {
  instanceId: string
  location: ICardCurrentLocation
  topHandRowRef: RefObject<HTMLDivElement | null>
  bottomHandRowRef: RefObject<HTMLDivElement | null>
  topTrashCardRef: RefObject<HTMLDivElement | null>
  bottomTrashCardRef: RefObject<HTMLDivElement | null>
}): HTMLElement | null {
  if (location.zone === 'hand') {
    const handRowElement = location.side === 'top' ? topHandRowRef.current : bottomHandRowRef.current
    return handRowElement?.querySelector<HTMLElement>(`[data-hand-instance-id="${instanceId}"]`)
      ?? handRowElement
  }

  if (location.zone === 'trash') {
    return (location.side === 'top' ? topTrashCardRef.current : bottomTrashCardRef.current)
  }

  return null
}

function useIdleRevalidationPoll(
  revalidatorState: IRevalidatorState,
  revalidate: () => void,
  intervalMs: number,
): void {
  useEffect(() => {
    if (revalidatorState !== 'idle') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      revalidate()
    }, intervalMs)

    return () => window.clearTimeout(timeoutId)
  }, [intervalMs, revalidate, revalidatorState])
}

function collectBoardDefinitionIds(
  player: IGamePlayerStateResponse,
  includeHand: boolean,
): Set<string> {
  const definitionIds = new Set<string>()
  const pushCard = (card: { cardDefinitionId?: string } | null | undefined): void => {
    const cardDefinitionId = card?.cardDefinitionId?.trim()
    if (cardDefinitionId) {
      definitionIds.add(cardDefinitionId)
    }
  }

  pushCard(player.leader)
  for (const zone of [player.characterField, player.supportZone, player.exileZone, player.trash]) {
    for (const card of zone) {
      pushCard(card)
    }
  }

  if (includeHand) {
    for (const card of player.hand) {
      pushCard(card)
    }
  }

  return definitionIds
}

function isSamePlayerId(playerId: string | undefined, candidateId: string | undefined): boolean {
  if (!playerId || !candidateId) {
    return false
  }

  return playerId.trim().toLowerCase() === candidateId.trim().toLowerCase()
}

function buildGameArtPreloadPlan(
  gameCards: IGameLoaderData['gameCards'],
  gameState: IGameStateResponse | null,
  authUserId: string | undefined,
): { visibleCards: ICardArtPreloadEntry[]; remainingCards: ICardArtPreloadEntry[]; signature: string } {
  const visibleDefinitionIds = new Set<string>()

  if (gameState) {
    for (const player of gameState.players) {
      const includeHand = isSamePlayerId(player.playerId, authUserId)
      for (const definitionId of collectBoardDefinitionIds(player, includeHand)) {
        visibleDefinitionIds.add(definitionId)
      }
    }
  }

  const visibleCards: ICardArtPreloadEntry[] = []
  const remainingCards: ICardArtPreloadEntry[] = []
  const visibleSignatureIds: string[] = []
  const remainingSignatureIds: string[] = []
  const seen = new Set<string>()

  for (const card of gameCards) {
    const cardId = card.id?.trim()
    if (!cardId || seen.has(cardId.toLowerCase())) {
      continue
    }

    seen.add(cardId.toLowerCase())
    const entry: ICardArtPreloadEntry = { id: cardId, imageVersion: card.imageVersion }
    if (visibleDefinitionIds.has(cardId)) {
      visibleCards.push(entry)
      visibleSignatureIds.push(cardId)
    } else {
      remainingCards.push(entry)
      remainingSignatureIds.push(cardId)
    }
  }

  const sortedVisibleIds = visibleSignatureIds.map((id) => id.toLowerCase()).sort((a, b) => a.localeCompare(b))
  const sortedRemainingIds = remainingSignatureIds.map((id) => id.toLowerCase()).sort((a, b) => a.localeCompare(b))

  return {
    visibleCards,
    remainingCards,
    signature: `${sortedVisibleIds.join('|')}#${sortedRemainingIds.join('|')}`,
  }
}

function useCardCatalogPreload(
  gameCards: IGameLoaderData['gameCards'],
  gameState: IGameStateResponse | null,
  authUserId: string | undefined,
): void {
  const lastPreloadedSignatureRef = useRef('')
  const preloadPlan = useMemo(
    () => buildGameArtPreloadPlan(gameCards, gameState, authUserId),
    [gameCards, gameState, authUserId],
  )

  const preloadGameImages = useCallback((): void => {
    void preloadCardArtInPriorityBatches([
      { cards: preloadPlan.visibleCards, width: CARD_ART_WIDTHS.board },
      { cards: preloadPlan.visibleCards, width: CARD_ART_WIDTHS.preview },
      { cards: preloadPlan.remainingCards, width: CARD_ART_WIDTHS.board },
    ]).catch(() => {
      // Card preloading is best effort and must not block gameplay rendering.
    })

    void preloadImageSources(STATIC_GAME_IMAGE_SOURCES).catch(() => {
      // Static image preloading is best effort and must not block gameplay rendering.
    })
  }, [preloadPlan])

  useEffect(() => {
    if (preloadPlan.signature !== lastPreloadedSignatureRef.current) {
      lastPreloadedSignatureRef.current = preloadPlan.signature
      preloadGameImages()
    }
  }, [preloadGameImages, preloadPlan])

  useEffect(() => {
    function handleReconnect() {
      preloadGameImages()
    }

    window.addEventListener('online', handleReconnect)
    return () => window.removeEventListener('online', handleReconnect)
  }, [preloadGameImages])
}


function useHandZoneAnimationEffects({
  topHandInstanceIds,
  bottomHandInstanceIds,
  topDeckCount,
  bottomDeckCount,
  topTrashCount,
  bottomTrashCount,
  drawToHandStaggerMs,
  drawToHandRevealDelayMs,
  handToPileStaggerMs,
  topDeckCardRef,
  bottomDeckCardRef,
  topTrashCardRef,
  bottomTrashCardRef,
  topHandRowRef,
  bottomHandRowRef,
  animControllerRef,
  setBottomHandFaceUpByInstanceId,
}: IUseHandZoneAnimationEffectsArgs): void {
  useEffect(() => {
    const animController = animControllerRef.current
    const previousSnapshot = animController.previousHandZoneSnapshot
    const nextTopHandInstanceIdSet = new Set(topHandInstanceIds)
    const nextBottomHandInstanceIdSet = new Set(bottomHandInstanceIds)

    if (previousSnapshot.isInitialized) {
      const newTopHandCards = topHandInstanceIds.filter((instanceId) => !previousSnapshot.topHandInstanceIds.has(instanceId))
      const newBottomHandCards = bottomHandInstanceIds.filter((instanceId) => !previousSnapshot.bottomHandInstanceIds.has(instanceId))
      const removedTopHandCards = [...previousSnapshot.topHandInstanceIds].filter((instanceId) => !nextTopHandInstanceIdSet.has(instanceId))
      const removedBottomHandCards = [...previousSnapshot.bottomHandInstanceIds].filter((instanceId) => !nextBottomHandInstanceIdSet.has(instanceId))
      const topDeckDecrease = Math.max(previousSnapshot.topDeckCount - topDeckCount, 0)
      const bottomDeckDecrease = Math.max(previousSnapshot.bottomDeckCount - bottomDeckCount, 0)
      const topTrashIncrease = Math.max(topTrashCount - previousSnapshot.topTrashCount, 0)
      const bottomTrashIncrease = Math.max(bottomTrashCount - previousSnapshot.bottomTrashCount, 0)
      const topDeckToHandCards = newTopHandCards.slice(0, topDeckDecrease)
      const bottomDeckToHandCards = animController.pendingMulliganDrawReplay
        ? bottomHandInstanceIds
        : newBottomHandCards.slice(0, bottomDeckDecrease)
      const topHandToTrashCards = removedTopHandCards.slice(0, topTrashIncrease)
      const bottomHandToTrashCards = removedBottomHandCards.slice(0, bottomTrashIncrease)

      if (animController.pendingMulliganDrawReplay) {
        animController.pendingMulliganDrawReplay = false
      }

      function runInferredHandToTrashAnimation(side: 'top' | 'bottom', cardInstanceId: string): void {
        const sourceHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current
        const sourceCardElement = sourceHandRowElement?.querySelector<HTMLDivElement>(
          `[data-hand-instance-id="${cardInstanceId}"]`,
        ) ?? null

        if (!sourceCardElement) {
          return
        }

        const sourceRect = sourceCardElement.getBoundingClientRect()
        if (sourceRect.width <= 0 || sourceRect.height <= 0) {
          return
        }

        void runRectToDynamicElementAnimation({
          sourceRect,
          durationMs: 340,
          resolveDestinationElement: () => {
            return side === 'top' ? topTrashCardRef.current : bottomTrashCardRef.current
          },
          resolveFallbackElement: () => {
            return side === 'top' ? topTrashCardRef.current : bottomTrashCardRef.current
          },
        })
      }

      if (topHandToTrashCards.length > 0 || bottomHandToTrashCards.length > 0) {
        animController.pendingDrawAnimationFrameId = window.requestAnimationFrame(() => {
          topHandToTrashCards.forEach((instanceId, index) => {
            const movementDelay = index * handToPileStaggerMs
            const timeoutId = window.setTimeout(() => {
              runInferredHandToTrashAnimation('top', instanceId)
            }, movementDelay)
            animController.pendingDrawTimeoutIds.push(timeoutId)
          })

          bottomHandToTrashCards.forEach((instanceId, index) => {
            const movementDelay = index * handToPileStaggerMs
            const timeoutId = window.setTimeout(() => {
              runInferredHandToTrashAnimation('bottom', instanceId)
            }, movementDelay)
            animController.pendingDrawTimeoutIds.push(timeoutId)
          })
        })
      }

      if (bottomDeckToHandCards.length > 0) {
        setBottomHandFaceUpByInstanceId((previousState) => {
          const nextState: Record<string, boolean> = {}

          for (const instanceId of bottomHandInstanceIds) {
            nextState[instanceId] = previousState[instanceId] ?? true
          }

          for (const instanceId of bottomDeckToHandCards) {
            nextState[instanceId] = false
          }

          return nextState
        })
      }

      if (topDeckToHandCards.length > 0 || bottomDeckToHandCards.length > 0) {
        const lastDeckToHandIndex = Math.max(
          topDeckToHandCards.length > 0 ? topDeckToHandCards.length - 1 : -1,
          bottomDeckToHandCards.length > 0 ? bottomDeckToHandCards.length - 1 : -1,
        )
        animController.drawAnimationEndsAt = Date.now()
          + Math.max(lastDeckToHandIndex, 0) * drawToHandStaggerMs
          + DECK_TO_HAND_FLY_DURATION_MS
          + drawToHandRevealDelayMs
          + DRAW_ANIMATION_COMPLETE_PADDING_MS

        animController.pendingDrawAnimationFrameId = window.requestAnimationFrame(() => {
          topDeckToHandCards.forEach((instanceId, index) => {
            const movementDelay = index * drawToHandStaggerMs
            const timeoutId = window.setTimeout(() => {
              runDeckToHandAnimation({
                side: 'top',
                cardInstanceId: instanceId,
                topDeckCardRef,
                bottomDeckCardRef,
                topHandRowRef,
                bottomHandRowRef,
              })
            }, movementDelay)
            animController.pendingDrawTimeoutIds.push(timeoutId)
          })

          bottomDeckToHandCards.forEach((instanceId, index) => {
            const movementDelay = index * drawToHandStaggerMs
            const movementTimeoutId = window.setTimeout(() => {
              runDeckToHandAnimation({
                side: 'bottom',
                cardInstanceId: instanceId,
                topDeckCardRef,
                bottomDeckCardRef,
                topHandRowRef,
                bottomHandRowRef,
              })
            }, movementDelay)

            const revealTimeoutId = window.setTimeout(() => {
              setBottomHandFaceUpByInstanceId((previousState) => {
                if (!(instanceId in previousState)) {
                  return previousState
                }

                return {
                  ...previousState,
                  [instanceId]: true,
                }
              })
            }, movementDelay + drawToHandRevealDelayMs)
            animController.pendingDrawTimeoutIds.push(movementTimeoutId, revealTimeoutId)
          })
        })
      }
    }

    setBottomHandFaceUpByInstanceId((previousState) => {
      const nextState: Record<string, boolean> = {}
      for (const instanceId of bottomHandInstanceIds) {
        nextState[instanceId] = previousState[instanceId] ?? true
      }

      return nextState
    })

    animController.previousHandZoneSnapshot = {
      topHandInstanceIds: new Set(topHandInstanceIds),
      bottomHandInstanceIds: new Set(bottomHandInstanceIds),
      topDeckCount,
      bottomDeckCount,
      topTrashCount,
      bottomTrashCount,
      isInitialized: true,
    }
  }, [
    bottomDeckCount,
    bottomHandInstanceIds,
    bottomTrashCount,
    drawToHandRevealDelayMs,
    drawToHandStaggerMs,
    handToPileStaggerMs,
    topDeckCount,
    topHandInstanceIds,
    topTrashCount,
    animControllerRef,
    setBottomHandFaceUpByInstanceId,
    topDeckCardRef,
    bottomDeckCardRef,
    topTrashCardRef,
    bottomTrashCardRef,
    topHandRowRef,
    bottomHandRowRef,
  ])

  useEffect(() => {
    const animController = animControllerRef.current

    return () => {
      if (animController.pendingDrawAnimationFrameId !== null) {
        window.cancelAnimationFrame(animController.pendingDrawAnimationFrameId)
      }

      animController.pendingDrawTimeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId)
      })
      animController.pendingDrawTimeoutIds = []
    }
  }, [animControllerRef])
}

/**
 * Flies a ghost of every card that leaves the character field, the support area or the hand for another zone
 * the board renders (trash pile or a hand row) — K.O.s, used supports, discards and cards bounced back to a
 * hand by effects like N-020. The rect and art come from the snapshot taken on the previous render, because
 * the state update that moved the card has already re-rendered the board: the real element is gone (or has
 * jumped to its new zone) by the time the effect runs.
 */
function useCardMoveGhostAnimationEffect({
  topPlayerCardInstanceIds,
  bottomPlayerCardInstanceIds,
  boardZoneRef,
  topHandRowRef,
  bottomHandRowRef,
  topTrashCardRef,
  bottomTrashCardRef,
  animControllerRef,
}: IUseCardMoveGhostAnimationEffectArgs): void {
  const ghostSnapshotRef = useRef<Map<string, ICardGhostSnapshot>>(new Map())

  useEffect(() => {
    const previousSnapshots = ghostSnapshotRef.current
    const nextSnapshots = snapshotRenderedCardGhosts({ boardZoneRef, topHandRowRef, bottomHandRowRef })
    const topZones = buildZoneInstanceIdSets(topPlayerCardInstanceIds)
    const bottomZones = buildZoneInstanceIdSets(bottomPlayerCardInstanceIds)
    const animController = animControllerRef.current
    let flyingIndex = 0

    for (const [instanceId, snapshot] of previousSnapshots) {
      const currentLocation = resolveCardCurrentLocation(instanceId, topZones, bottomZones)

      // Unchanged zone (still on the board / in the same hand) or a zone the board does not render
      // (deck, exile): nothing to animate.
      if (!currentLocation || currentLocation.zone === snapshot.zone) {
        continue
      }

      const destinationElement = resolveMoveGhostDestinationElement({
        instanceId,
        location: currentLocation,
        topHandRowRef,
        bottomHandRowRef,
        topTrashCardRef,
        bottomTrashCardRef,
      })

      if (!destinationElement) {
        continue
      }

      // An explicit ghost already flew this card (tribute summon): drop the claim instead of flying twice.
      if (animController.suppressedExitGhostInstanceIds.delete(instanceId)) {
        continue
      }

      const movementDelay = flyingIndex * CARD_TO_TRASH_STAGGER_MS
      flyingIndex += 1
      const timeoutId = window.setTimeout(() => {
        void runCardImageGhostToElementAnimation({
          imageSrc: snapshot.imageSrc,
          sourceRect: snapshot.rect,
          destinationElement,
          durationMs: CARD_TO_TRASH_FLY_DURATION_MS,
        })
      }, movementDelay)
      animController.pendingDrawTimeoutIds.push(timeoutId)
    }

    ghostSnapshotRef.current = nextSnapshots
  }, [
    animControllerRef,
    boardZoneRef,
    bottomHandRowRef,
    bottomPlayerCardInstanceIds,
    bottomTrashCardRef,
    topHandRowRef,
    topPlayerCardInstanceIds,
    topTrashCardRef,
  ])
}

/**
 * Flies the card a reveal turned face up out of the deck slot and onto its owner's character field: a
 * "Reveal First" chain that summons the revealed card (N-019 / N-022) moves it deck→battlefield without any
 * client submission, and the revealed card is drawn by the deck pile rather than as a card face - so the
 * generic move-ghost effect has no snapshot to fly from. The flight is driven by the reveal itself: the card
 * that was the revealed deck card last render and now has a character-field card element lands from the deck
 * slot.
 */
function useRevealedCardSummonFlightEffect({
  currentPlayer,
  opponentPlayer,
  topDeckCardRef,
  bottomDeckCardRef,
  boardZoneRef,
}: IUseRevealedCardSummonFlightEffectArgs): void {
  const revealedDeckCardRef = useRef<IRevealedDeckCardLocation | null>(null)

  useEffect(() => {
    const revealedDeckCard = resolveRevealedDeckCardLocation(currentPlayer, opponentPlayer)
    const previousRevealedDeckCard = revealedDeckCardRef.current
    revealedDeckCardRef.current = revealedDeckCard

    // Still the same reveal (or no reveal was ever presented): nothing left the deck yet.
    if (!previousRevealedDeckCard || previousRevealedDeckCard.instanceId === revealedDeckCard?.instanceId) {
      return
    }

    const deckSlotElement = previousRevealedDeckCard.side === 'top'
      ? topDeckCardRef.current
      : bottomDeckCardRef.current
    const destinationElement = resolveBattlefieldCardElement(boardZoneRef.current, previousRevealedDeckCard)

    // The reveal ended without a summon (the post-condition failed) or left play: nothing to fly.
    if (!deckSlotElement || !destinationElement) {
      return
    }

    // The destination element is animated in place (scale 0.92 → 1 from the deck slot), exactly like an
    // explicit hand→field summon: only the real card is drawn, so no copy is left behind in the slot.
    void runRectToDynamicElementAnimation({
      sourceRect: deckSlotElement.getBoundingClientRect(),
      durationMs: REVEAL_SUMMON_FLIGHT_DURATION_MS,
      resolveDestinationElement: () => resolveBattlefieldCardElement(boardZoneRef.current, previousRevealedDeckCard),
    })
  }, [
    boardZoneRef,
    bottomDeckCardRef,
    currentPlayer,
    opponentPlayer,
    topDeckCardRef,
  ])
}

/** The deck card a reveal turned face up, and whose deck slot the flight starts from. */
type IRevealedDeckCardLocation = {
  instanceId: string
  side: 'top' | 'bottom'
}

function resolveRevealedDeckCardLocation(
  currentPlayer: IGamePlayerStateResponse | null,
  opponentPlayer: IGamePlayerStateResponse | null,
): IRevealedDeckCardLocation | null {
  const ownRevealedCard = currentPlayer?.deck.find((card) => card.isRevealed === true)
  if (ownRevealedCard) {
    return { instanceId: ownRevealedCard.instanceId, side: 'bottom' }
  }

  // The opponent only receives the deck cards a reveal has turned over.
  const opponentRevealedCard = opponentPlayer?.deck.find((card) => card.isRevealed === true)
  return opponentRevealedCard ? { instanceId: opponentRevealedCard.instanceId, side: 'top' } : null
}

function resolveBattlefieldCardElement(
  boardElement: HTMLElement | null,
  location: IRevealedDeckCardLocation,
): HTMLElement | null {
  return boardElement?.querySelector<HTMLElement>(
    `[data-zone="character-field-card"][data-slot-side="${location.side}"]`
    + `[data-card-instance-id="${location.instanceId}"]`,
  ) ?? null
}

function useAutoAdvancePhaseEffect({
  isConnected,
  isActionPendingFlag,
  hasPendingPromptFlag,
  availableActions,
  phase,
  turnNumber,
  activePlayerId,
  animControllerRef,
  submitHubIntent,
}: IUseAutoAdvancePhaseEffectArgs): void {
  const advanceTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const animController = animControllerRef.current

    function clearPendingAdvanceTimer(): void {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current)
        advanceTimerRef.current = null
      }
    }

    clearPendingAdvanceTimer()

    if (!isConnected || isActionPendingFlag || hasPendingPromptFlag) {
      return
    }

    const hasEnabledAdvancePhaseAction = availableActions.some(
      (action) => action.actionId === 'advance-phase' && action.isEnabled,
    )
    
    if (!hasEnabledAdvancePhaseAction) {
      return
    }

    if (!AUTO_SIGNAL_PHASES.has(phase)) {
      // Reaching a manual decision phase ends the previous auto-advance cycle. Clearing
      // the latch lets the same turn/phase/active player be auto-signalled again if it
      // comes back around later in the same turn (for example a second attack).
      animController.lastAutoSignalKey = ''
      return
    }

    const phaseSnapshotKey = `${turnNumber}:${phase}:${activePlayerId}`
    if (animController.lastAutoSignalKey === phaseSnapshotKey) {
      return
    }

    // The initial hand deal, per-turn draws, and mulligan re-draws all animate
    // cards from the deck into the hand. Auto-advancing to the next phase while
    // one of those animations is still in flight would cut it, so every auto
    // signal waits until the last scheduled deck→hand animation has finished.
    // The signal is re-armed until it actually dispatches, so the user should
    // never have to click an "Advance Phase" button in these flows.
    function isDrawAnimationInFlight(): boolean {
      return animController.drawAnimationEndsAt !== null && Date.now() < animController.drawAnimationEndsAt
    }

    function scheduleAutoAdvance(): void {
      const drawAnimationEndsAt = animController.drawAnimationEndsAt
      const waitDelayMs = drawAnimationEndsAt === null
        ? AUTO_ADVANCE_RECHECK_MS
        : Math.max(AUTO_ADVANCE_RECHECK_MS, drawAnimationEndsAt - Date.now())

      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null
        dispatchAutoAdvance()
      }, waitDelayMs)
    }

    let autoAdvanceRetriesLeft = AUTO_ADVANCE_MAX_RETRIES

    function resolveCurrentSnapshotKey(): string {
      const currentGameState = useGameHubStore.getState().gameState
      if (!currentGameState) {
        return ''
      }

      return `${currentGameState.turnNumber}:${currentGameState.phase}:${currentGameState.activePlayerId}`
    }

    // If the state does not move on after an auto signal (a dropped or transiently
    // rejected dispatch), retry a bounded number of times so the phase cannot stall
    // until a manual page refresh.
    function scheduleAutoAdvanceRetry(): void {
      if (autoAdvanceRetriesLeft <= 0) {
        return
      }

      autoAdvanceRetriesLeft -= 1
      advanceTimerRef.current = window.setTimeout(() => {
        advanceTimerRef.current = null
        if (resolveCurrentSnapshotKey() !== phaseSnapshotKey) {
          return
        }

        dispatchAutoAdvance()
      }, AUTO_ADVANCE_RETRY_DELAY_MS)
    }

    function dispatchAutoAdvance(): void {
      const currentStoreState = useGameHubStore.getState()
      const isDispatchBlocked = currentStoreState.isActionPending
        || Boolean(currentStoreState.gameState?.pendingPrompt)
        || isDrawAnimationInFlight()

      if (isDispatchBlocked) {
        scheduleAutoAdvance()
        return
      }

      advanceTimerRef.current = null
      animController.lastAutoSignalKey = phaseSnapshotKey
      void submitHubIntent({ intent: 'advance-phase' })
      scheduleAutoAdvanceRetry()
    }

    scheduleAutoAdvance()
    return clearPendingAdvanceTimer
  }, [
    activePlayerId,
    animControllerRef,
    availableActions,
    hasPendingPromptFlag,
    isActionPendingFlag,
    isConnected,
    phase,
    submitHubIntent,
    turnNumber,
  ])
}

export {
  useIdleRevalidationPoll,
  useCardCatalogPreload,
  useHandZoneAnimationEffects,
  useCardMoveGhostAnimationEffect,
  useRevealedCardSummonFlightEffect,
  useAutoAdvancePhaseEffect,
}