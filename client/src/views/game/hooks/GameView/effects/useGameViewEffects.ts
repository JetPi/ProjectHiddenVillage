import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useGameHubStore } from '@/state/gameHubStore'
import { preloadCardArtInPriorityBatches, type ICardArtPreloadEntry } from '@/services/cardPreloadService'
import { preloadImageSources } from '@/services/imagePreloadCache'
import { CARD_ART_WIDTHS } from '@/services/api/cardArt'
import type { IAnimationEventResponse, IGameStateResponse, IGamePlayerStateResponse } from '@/services/api/types/game'
import chakraCardImage from '@/assets/ChakraCard.webp'
import summonCardImage from '@/assets/SummonCard.webp'
import cardBackImage from '@/assets/CardBackside.webp'
import type {
  IGameLoaderData,
  IGameViewAnimController,
  IPlayerCardZoneInstanceIds,
  IRevalidatorState,
  IUseAdoptRecordedAnimationEventsOnMountArgs,
  IUseAdoptRewindPushArgs,
  IUseCardMoveGhostAnimationEffectArgs,
  IUseHandZoneAnimationEffectsArgs,
  IUsePhasePresentationAckEffectArgs,
  IUseRevealedCardSummonFlightEffectArgs,
  IUseSupportSummonFlightEffectArgs,
  IUseTrashRecallSummonFlightEffectArgs,
} from '@/views/game/types'
import {
  PHASE_PRESENTATION_RETRY_MS,
  isPresentationAwaitingAck,
  resolvePresentationAckAtMs,
} from '@/views/game/utils/functions'
import {
  clearFlights,
  noteFlight,
  pruneSettledFlights,
  resolveFlightsSettleAtMs,
  runDeckToHandAnimation,
  runElementFromRectAnimation,
  runElementToRectAnimation,
  whenIdle,
} from '@/views/game/animation'
import {
  CARD_TO_TRASH_FLY_DURATION_MS,
  CARD_TO_TRASH_STAGGER_MS,
  DECK_TO_HAND_FLY_DURATION_MS,
  DRAW_ANIMATION_COMPLETE_PADDING_MS,
  REVEAL_SUMMON_FLIGHT_DURATION_MS,
  SUPPORT_SUMMON_FLIGHT_DURATION_MS,
  TRASH_RECALL_SUMMON_FLIGHT_DURATION_MS,
} from '@/views/game/animation/tuning'
import { cancelAllFlights } from '@/views/game/animation/flightRegistry'

const STATIC_GAME_IMAGE_SOURCES = [chakraCardImage, summonCardImage, cardBackImage]

type ICardRenderedZone = 'battlefield' | 'support' | 'hand'

type ICardGhostSnapshot = {
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

    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      continue
    }

    snapshots.set(instanceId, {
      rect,
      side: element.dataset.slotSide === 'top' ? 'top' : element.dataset.slotSide === 'bottom' ? 'bottom' : fallbackSide,
      zone: resolveRenderedZone(element, fallbackZone),
    })
  }
}

/**
 * A board that mounts must adopt the movement history it was handed, not replay it.
 *
 * The state payload carries a bounded tail of recorded card movements and the client animates the ones it has
 * not seen yet. That is right for a push received while the board is mounted, and wrong for the first payload of
 * a mount: a reload hands the client the last movements of the game, all of which already happened, so every
 * consumer that only checks "not handled yet" replays them - a summon flies out of the deck again, a draw flies
 * out of the deck into a hand that already holds the card, and because `consumeRecordedDeckSummon` consumes one
 * event per pass, a refresh walked a *sequence* of old summons across the board.
 *
 * Adopting the mount payload's ids before any consumer runs makes "unhandled" mean "happened while I was
 * watching". Nothing is lost: a movement that happens after mount arrives in a later payload with an id that is
 * not in this set. This is the same rule `EffectNoticeBanner` follows for notices, and it is why the first
 * render of a refreshed board is its final one - cards appear where they belong instead of animating there.
 *
 * Must stay the first effect of the side-effect hook (a layout effect, so it is in place before the flight
 * scheduling effects of the same commit run).
 */
function useAdoptRecordedAnimationEventsOnMount({
  animationEvents,
  animControllerRef,
}: IUseAdoptRecordedAnimationEventsOnMountArgs): void {
  const hasAdoptedRef = useRef(false)

  useLayoutEffect(() => {
    if (hasAdoptedRef.current) {
      return
    }
    hasAdoptedRef.current = true

    for (const animationEvent of animationEvents ?? []) {
      animControllerRef.current.handledAnimationEventIds.add(animationEvent.eventId)
    }
  }, [animationEvents, animControllerRef])
}

/**
 * An approved redo hands the board a position it did not reach by moving: the restored payload's movement tail is
 * history the client already played. The mount rule is applied again on the push that changed `lastRewindId`, and
 * the previous hand snapshot is dropped, so cards the rewind put back are painted where they now belong instead of
 * flying into a hand that already holds them.
 */
function useAdoptRewindPush({
  lastRewindId,
  animationEvents,
  animControllerRef,
}: IUseAdoptRewindPushArgs): void {
  const lastSeenRewindIdRef = useRef<string | null>(lastRewindId ?? null)

  useLayoutEffect(() => {
    const nextRewindId = lastRewindId ?? null

    if (lastSeenRewindIdRef.current === nextRewindId) {
      return
    }

    lastSeenRewindIdRef.current = nextRewindId

    const animController = animControllerRef.current

    for (const animationEvent of animationEvents ?? []) {
      animController.handledAnimationEventIds.add(animationEvent.eventId)
    }

    animController.previousHandZoneSnapshot = {
      topHandInstanceIds: new Set(),
      bottomHandInstanceIds: new Set(),
      topDeckCount: 0,
      bottomDeckCount: 0,
      topTrashCount: 0,
      bottomTrashCount: 0,
      isInitialized: false,
    }
  }, [animationEvents, animControllerRef, lastRewindId])
}

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
    })

    void preloadImageSources(STATIC_GAME_IMAGE_SOURCES).catch(() => {
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


const DRAW_MOVEMENT_KIND = 'draw'
const DISCARD_MOVEMENT_KIND = 'discard'
const HAND_MOVEMENT_ZONE = 'hand'
const TRASH_MOVEMENT_ZONE = 'trash'

type IRecordedHandMovements = {
  drawnTop: string[]
  drawnBottom: string[]
  discardedTop: string[]
  discardedBottom: string[]
}

function consumeRecordedHandMovements(
  animController: IGameViewAnimController,
  animationEvents: IAnimationEventResponse[] | null | undefined,
  zoneInstanceIdsBySide: {
    topHand: string[]
    bottomHand: string[]
    topTrash: string[]
    bottomTrash: string[]
  },
): IRecordedHandMovements | null {
  if (!animationEvents || animationEvents.length === 0) {
    return null
  }

  const topHand = toNormalizedInstanceIdSet(zoneInstanceIdsBySide.topHand)
  const bottomHand = toNormalizedInstanceIdSet(zoneInstanceIdsBySide.bottomHand)
  const topTrash = toNormalizedInstanceIdSet(zoneInstanceIdsBySide.topTrash)
  const bottomTrash = toNormalizedInstanceIdSet(zoneInstanceIdsBySide.bottomTrash)
  const movements: IRecordedHandMovements = {
    drawnTop: [],
    drawnBottom: [],
    discardedTop: [],
    discardedBottom: [],
  }

  for (const animationEvent of animationEvents) {
    if (animController.handledAnimationEventIds.has(animationEvent.eventId)) {
      continue
    }

    const kind = animationEvent.kind.trim().toLowerCase()
    const toZone = (animationEvent.toZone ?? '').trim().toLowerCase()
    const normalizedCardInstanceId = animationEvent.cardInstanceId.trim().toLowerCase()

    if (kind === DRAW_MOVEMENT_KIND && toZone === HAND_MOVEMENT_ZONE) {
      if (topHand.has(normalizedCardInstanceId)) {
        animController.handledAnimationEventIds.add(animationEvent.eventId)
        movements.drawnTop.push(animationEvent.cardInstanceId)
      } else if (bottomHand.has(normalizedCardInstanceId)) {
        animController.handledAnimationEventIds.add(animationEvent.eventId)
        movements.drawnBottom.push(animationEvent.cardInstanceId)
      }
      continue
    }

    if (kind === DISCARD_MOVEMENT_KIND && toZone === TRASH_MOVEMENT_ZONE) {
      if (topTrash.has(normalizedCardInstanceId)) {
        animController.handledAnimationEventIds.add(animationEvent.eventId)
        movements.discardedTop.push(animationEvent.cardInstanceId)
      } else if (bottomTrash.has(normalizedCardInstanceId)) {
        animController.handledAnimationEventIds.add(animationEvent.eventId)
        movements.discardedBottom.push(animationEvent.cardInstanceId)
      }
    }
  }

  const hasRecordedMovement = movements.drawnTop.length > 0
    || movements.drawnBottom.length > 0
    || movements.discardedTop.length > 0
    || movements.discardedBottom.length > 0

  return hasRecordedMovement ? movements : null
}

function toNormalizedInstanceIdSet(instanceIds: string[]): Set<string> {
  return new Set(instanceIds.map((instanceId) => instanceId.trim().toLowerCase()))
}

const SUMMON_MOVEMENT_KIND = 'summon'
const DECK_MOVEMENT_ZONE = 'deck'

function consumeRecordedDeckSummon(
  animController: IGameViewAnimController,
  animationEvents: IAnimationEventResponse[] | null | undefined,
): IAnimationEventResponse | null {
  if (!animationEvents || animationEvents.length === 0) {
    return null
  }

  let deckSummon: IAnimationEventResponse | null = null

  for (const animationEvent of animationEvents) {
    if (animController.handledAnimationEventIds.has(animationEvent.eventId)) {
      continue
    }

    if (deckSummon
      || animationEvent.kind.trim().toLowerCase() !== SUMMON_MOVEMENT_KIND
      || (animationEvent.fromZone ?? '').trim().toLowerCase() !== DECK_MOVEMENT_ZONE) {
      continue
    }

    animController.handledAnimationEventIds.add(animationEvent.eventId)
    deckSummon = animationEvent
  }

  return deckSummon
}

function resolveCardSideForPlayerId(
  playerId: string,
  currentPlayer: IGamePlayerStateResponse | null,
  opponentPlayer: IGamePlayerStateResponse | null,
): 'top' | 'bottom' | null {
  const normalizedPlayerId = playerId.trim().toLowerCase()
  if (!normalizedPlayerId) {
    return null
  }

  if ((currentPlayer?.playerId ?? '').trim().toLowerCase() === normalizedPlayerId) {
    return 'bottom'
  }

  if ((opponentPlayer?.playerId ?? '').trim().toLowerCase() === normalizedPlayerId) {
    return 'top'
  }

  return null
}

function markCardAwaitingArrival(instanceId: string, handRowRef: RefObject<HTMLDivElement | null>): void {
  handRowRef.current
    ?.querySelector<HTMLElement>(`[data-hand-instance-id="${instanceId}"]`)
    ?.setAttribute('data-card-arrival-pending', 'true')
}

function clearStaleDepartureHides(
  handRowRef: RefObject<HTMLDivElement | null>,
  presentInstanceIds: ReadonlySet<string>,
): void {
  handRowRef.current
    ?.querySelectorAll<HTMLElement>('[data-card-departed="true"]')
    .forEach((element) => {
      const instanceId = element.getAttribute('data-hand-instance-id') ?? ''
      if (!presentInstanceIds.has(instanceId)) {
        return
      }

      if (element.getAttribute('data-card-traveling') === 'true') {
        return
      }

      element.removeAttribute('data-card-departed')
      element.style.visibility = ''
    })
}

function releaseCardAwaitingArrival(instanceId: string, handRowRef: RefObject<HTMLDivElement | null>): void {
  handRowRef.current
    ?.querySelector<HTMLElement>(`[data-hand-instance-id="${instanceId}"]`)
    ?.removeAttribute('data-card-arrival-pending')
}

function releaseAllCardArrivals(handRowRef: RefObject<HTMLDivElement | null>): void {
  handRowRef.current
    ?.querySelectorAll<HTMLElement>('[data-card-arrival-pending="true"]')
    .forEach((element) => {
      element.removeAttribute('data-card-arrival-pending')
    })
}

function useHandZoneAnimationEffects({
  topHandInstanceIds,
  bottomHandInstanceIds,
  topDeckCount,
  bottomDeckCount,
  topTrashCount,
  bottomTrashCount,
  topTrashInstanceIds,
  bottomTrashInstanceIds,
  drawToHandStaggerMs,
  drawToHandRevealDelayMs,
  handToPileStaggerMs,
  animationEvents,
  topDeckCardRef,
  bottomDeckCardRef,
  topTrashCardRef,
  bottomTrashCardRef,
  topHandRowRef,
  bottomHandRowRef,
  animControllerRef,
  setBottomHandFaceUpByInstanceId,
}: IUseHandZoneAnimationEffectsArgs): void {
  useLayoutEffect(() => {
    const animController = animControllerRef.current
    const previousSnapshot = animController.previousHandZoneSnapshot

    const nextTopHandInstanceIdSet = new Set(topHandInstanceIds)
    const nextBottomHandInstanceIdSet = new Set(bottomHandInstanceIds)
    clearStaleDepartureHides(topHandRowRef, nextTopHandInstanceIdSet)
    clearStaleDepartureHides(bottomHandRowRef, nextBottomHandInstanceIdSet)
    const nextTopTrashInstanceIdSet = new Set(topTrashInstanceIds)
    const nextBottomTrashInstanceIdSet = new Set(bottomTrashInstanceIds)

    if (previousSnapshot.isInitialized) {
      const newTopHandCards = topHandInstanceIds.filter((instanceId) => !previousSnapshot.topHandInstanceIds.has(instanceId))
      const newBottomHandCards = bottomHandInstanceIds.filter((instanceId) => !previousSnapshot.bottomHandInstanceIds.has(instanceId))
      const removedTopHandCards = [...previousSnapshot.topHandInstanceIds].filter((instanceId) => !nextTopHandInstanceIdSet.has(instanceId))
      const removedBottomHandCards = [...previousSnapshot.bottomHandInstanceIds].filter((instanceId) => !nextBottomHandInstanceIdSet.has(instanceId))
      const topDeckDecrease = Math.max(previousSnapshot.topDeckCount - topDeckCount, 0)
      const bottomDeckDecrease = Math.max(previousSnapshot.bottomDeckCount - bottomDeckCount, 0)
      const topTrashIncrease = Math.max(topTrashCount - previousSnapshot.topTrashCount, 0)
      const bottomTrashIncrease = Math.max(bottomTrashCount - previousSnapshot.bottomTrashCount, 0)
      const recordedMovements = consumeRecordedHandMovements(animController, animationEvents, {
        topHand: topHandInstanceIds,
        bottomHand: bottomHandInstanceIds,
        topTrash: topTrashInstanceIds,
        bottomTrash: bottomTrashInstanceIds,
      })
      const topDeckToHandCards = recordedMovements?.drawnTop.length
        ? recordedMovements.drawnTop
        : newTopHandCards.slice(0, topDeckDecrease)
      const previousBottomHandIds = previousSnapshot.bottomHandInstanceIds
      const bottomHandChanged = bottomHandInstanceIds.length !== previousBottomHandIds.size
        || bottomHandInstanceIds.some((instanceId) => !previousBottomHandIds.has(instanceId))
      const isMulliganDrawReplay = animController.pendingMulliganDrawReplay
        && bottomHandChanged
        && Date.now() <= animController.pendingMulliganDrawReplayExpiresAtMs
      if (animController.pendingMulliganDrawReplay && Date.now() > animController.pendingMulliganDrawReplayExpiresAtMs) {
        animController.pendingMulliganDrawReplay = false
      }

      const bottomDeckToHandCards = isMulliganDrawReplay
        ? bottomHandInstanceIds
        : recordedMovements?.drawnBottom.length
          ? recordedMovements.drawnBottom
          : newBottomHandCards.slice(0, bottomDeckDecrease)
      const topHandToTrashCards = recordedMovements?.discardedTop.length
        ? recordedMovements.discardedTop
        : removedTopHandCards
          .filter((instanceId) => nextTopTrashInstanceIdSet.has(instanceId))
          .slice(0, topTrashIncrease)
      const bottomHandToTrashCards = recordedMovements?.discardedBottom.length
        ? recordedMovements.discardedBottom
        : removedBottomHandCards
          .filter((instanceId) => nextBottomTrashInstanceIdSet.has(instanceId))
          .slice(0, bottomTrashIncrease)

      topDeckToHandCards.forEach((instanceId) => markCardAwaitingArrival(instanceId, topHandRowRef))
      bottomDeckToHandCards.forEach((instanceId) => markCardAwaitingArrival(instanceId, bottomHandRowRef))

      if (isMulliganDrawReplay) {
        animController.pendingMulliganDrawReplay = false
      }

      function runInferredHandToTrashAnimation(side: 'top' | 'bottom', cardInstanceId: string): void {
        if (animController.suppressedExitGhostInstanceIds.delete(cardInstanceId)) {
          return
        }

        const sourceHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current
        const sourceCardElement = sourceHandRowElement?.querySelector<HTMLDivElement>(
          `[data-hand-instance-id="${cardInstanceId}"]`,
        ) ?? null

        if (!sourceCardElement) {
          return
        }

        const destinationElement = side === 'top' ? topTrashCardRef.current : bottomTrashCardRef.current
        if (!destinationElement) {
          return
        }

        void runElementToRectAnimation({
          element: sourceCardElement,
          destinationRect: destinationElement.getBoundingClientRect(),
          durationMs: CARD_TO_TRASH_FLY_DURATION_MS,
          key: cardInstanceId,
        })
      }

      if (topHandToTrashCards.length > 0 || bottomHandToTrashCards.length > 0) {
        animController.pendingDrawAnimationFrameId = window.requestAnimationFrame(() => {
          const lastHandToPileIndex = Math.max(topHandToTrashCards.length, bottomHandToTrashCards.length) - 1
          noteFlight(
            'hand-to-pile',
            Date.now()
              + Math.max(lastHandToPileIndex, 0) * handToPileStaggerMs
              + CARD_TO_TRASH_FLY_DURATION_MS,
          )

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
        noteFlight('draw', animController.drawAnimationEndsAt)

        animController.pendingDrawAnimationFrameId = window.requestAnimationFrame(() => {
          topDeckToHandCards.forEach((instanceId, index) => {
            const movementDelay = index * drawToHandStaggerMs
            const timeoutId = window.setTimeout(() => {
              releaseCardAwaitingArrival(instanceId, topHandRowRef)
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
              releaseCardAwaitingArrival(instanceId, bottomHandRowRef)
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
    bottomTrashInstanceIds,
    animationEvents,
    drawToHandRevealDelayMs,
    drawToHandStaggerMs,
    handToPileStaggerMs,
    topDeckCount,
    topHandInstanceIds,
    topTrashCount,
    topTrashInstanceIds,
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

      releaseAllCardArrivals(topHandRowRef)
      releaseAllCardArrivals(bottomHandRowRef)

      cancelAllFlights()
      clearFlights()
    }
  }, [animControllerRef, bottomHandRowRef, topHandRowRef])
}

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

      if (animController.suppressedExitGhostInstanceIds.delete(instanceId)) {
        continue
      }

      if (snapshot.zone === 'battlefield') {
        continue
      }

      const handRowStillHoldsCard = [topHandRowRef.current, bottomHandRowRef.current].some((handRow) => {
        return handRow?.querySelector(`[data-hand-instance-id="${instanceId}"]`) != null
      })
      if (snapshot.zone === 'hand' && handRowStillHoldsCard) {
        continue
      }

      const movementDelay = flyingIndex * CARD_TO_TRASH_STAGGER_MS
      flyingIndex += 1

      const timeoutId = window.setTimeout(() => {
        void runElementFromRectAnimation({
          element: destinationElement,
          sourceRect: snapshot.rect,
          durationMs: CARD_TO_TRASH_FLY_DURATION_MS,
          key: instanceId,
        })
      }, movementDelay)
      animController.pendingDrawTimeoutIds.push(timeoutId)
      noteFlight(`ghost:${instanceId}`, Date.now() + movementDelay + CARD_TO_TRASH_FLY_DURATION_MS)
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

function useDeckSummonFlightEffect({
  currentPlayer,
  opponentPlayer,
  topDeckCardRef,
  bottomDeckCardRef,
  boardZoneRef,
  animationEvents,
  animControllerRef,
}: IUseRevealedCardSummonFlightEffectArgs): void {
  useEffect(() => {
    const deckSummon = consumeRecordedDeckSummon(animControllerRef.current, animationEvents)
    if (!deckSummon) {
      return
    }

    const side = resolveCardSideForPlayerId(deckSummon.playerId, currentPlayer, opponentPlayer)
    if (!side) {
      return
    }

    const deckSlotElement = side === 'top' ? topDeckCardRef.current : bottomDeckCardRef.current
    const location: ICardZoneLocation = { instanceId: deckSummon.cardInstanceId, side }
    const destinationElement = resolveBattlefieldCardElement(boardZoneRef.current, location)

    if (!deckSlotElement || !destinationElement) {
      return
    }

    void runElementFromRectAnimation({
      element: destinationElement,
      sourceRect: deckSlotElement.getBoundingClientRect(),
      durationMs: REVEAL_SUMMON_FLIGHT_DURATION_MS,
    })
  }, [
    animControllerRef,
    animationEvents,
    boardZoneRef,
    bottomDeckCardRef,
    currentPlayer,
    opponentPlayer,
    topDeckCardRef,
  ])
}

function useTrashRecallSummonFlightEffect({
  currentPlayer,
  opponentPlayer,
  topTrashCardRef,
  bottomTrashCardRef,
  boardZoneRef,
}: IUseTrashRecallSummonFlightEffectArgs): void {
  const previousTrashInstanceIdsRef = useRef<{ top: Set<string>; bottom: Set<string> } | null>(null)

  useEffect(() => {
    const nextTrash = {
      top: new Set((opponentPlayer?.trash ?? []).map((card) => card.instanceId)),
      bottom: new Set((currentPlayer?.trash ?? []).map((card) => card.instanceId)),
    }
    const previousTrash = previousTrashInstanceIdsRef.current
    previousTrashInstanceIdsRef.current = nextTrash

    if (!previousTrash) {
      return
    }

    const flyFromTrashSlot = (side: 'top' | 'bottom'): void => {
      const trashSlotElement = side === 'top' ? topTrashCardRef.current : bottomTrashCardRef.current
      if (!trashSlotElement) {
        return
      }

      for (const instanceId of previousTrash[side]) {
        if (nextTrash[side].has(instanceId)) {
          continue
        }

        const location: ICardZoneLocation = { instanceId, side }
        if (!resolveBattlefieldCardElement(boardZoneRef.current, location)) {
          continue
        }

        const destinationElement = resolveBattlefieldCardElement(boardZoneRef.current, location)
        if (!destinationElement) {
          continue
        }

        void runElementFromRectAnimation({
          element: destinationElement,
          sourceRect: trashSlotElement.getBoundingClientRect(),
          durationMs: TRASH_RECALL_SUMMON_FLIGHT_DURATION_MS,
        })
      }
    }

    flyFromTrashSlot('top')
    flyFromTrashSlot('bottom')
  }, [
    boardZoneRef,
    bottomTrashCardRef,
    currentPlayer,
    opponentPlayer,
    topTrashCardRef,
  ])
}

/**
 * How long a remembered support-slot rect stays eligible for an arrival flight after the card has left it.
 *
 * A push is applied in one commit, but the engine can also place the card on the battlefield one commit later
 * (a summon that runs as a separate effect step). The rect is dropped as soon as it is used, and it expires so a
 * card that went to the trash can never fly onto the battlefield later.
 */
const SUPPORT_SUMMON_RECT_RETENTION_MS = 1_500

type ISupportSlotSnapshot = {
  rect: DOMRect
  side: 'top' | 'bottom'
  capturedAtMs: number
}

/**
 * A support card that leaves the support area for the battlefield arrives with its own flight.
 *
 * N-021/N-008/N-010 summon *themselves* out of the support area, and a move effect can do the same; the card is
 * then re-rendered on the battlefield by the same push that unmounts its support slot. Nothing else in the engine
 * covers that pair:
 * - the submit helpers (`runSubmitThenZoneEntryAnimation`) only cover moves the client initiates from the hand,
 * - `useDeckSummonFlightEffect` only reads a `summon` movement whose source is the deck,
 * - `useCardMoveGhostAnimationEffect` resolves no battlefield destination.
 * Without this effect the arriving battlefield card is simply painted at its final box - the reported
 * "instant teleport from the support row to the field".
 *
 * The source rect therefore has to be captured while the card is still in the support row, which is why this is a
 * layout effect: it runs after the push is committed but *before* the browser paints it, so the arriving card is
 * hidden (the flight primitive hides its element synchronously) on its very first painted frame.
 */
function useSupportSummonFlightEffect({
  boardZoneRef,
  supportSummonSignature,
}: IUseSupportSummonFlightEffectArgs): void {
  const previousSupportSlotsRef = useRef<Map<string, ISupportSlotSnapshot>>(new Map())

  useLayoutEffect(() => {
    const boardElement = boardZoneRef.current
    const previousSlots = previousSupportSlotsRef.current
    const nowMs = Date.now()
    const nextSlots = new Map<string, ISupportSlotSnapshot>()

    boardElement
      ?.querySelectorAll<HTMLElement>('[data-zone="support"][data-card-instance-id]')
      .forEach((element) => {
        const instanceId = element.dataset.cardInstanceId
        if (!instanceId) {
          return
        }

        const rect = element.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) {
          return
        }

        nextSlots.set(instanceId, {
          rect,
          side: element.dataset.slotSide === 'top' ? 'top' : 'bottom',
          capturedAtMs: nowMs,
        })
      })

    if (!boardElement) {
      previousSupportSlotsRef.current = nextSlots
      return
    }

    for (const [instanceId, slot] of previousSlots) {
      if (nextSlots.has(instanceId)) {
        continue
      }

      const destinationElement = resolveBattlefieldCardElement(boardElement, { instanceId, side: slot.side })
      if (!destinationElement) {
        if (nowMs - slot.capturedAtMs <= SUPPORT_SUMMON_RECT_RETENTION_MS) {
          nextSlots.set(instanceId, slot)
        }
        continue
      }

      void runElementFromRectAnimation({
        element: destinationElement,
        sourceRect: slot.rect,
        durationMs: SUPPORT_SUMMON_FLIGHT_DURATION_MS,
      })
    }

    previousSupportSlotsRef.current = nextSlots
  }, [boardZoneRef, supportSummonSignature])
}

type ICardZoneLocation = {
  instanceId: string
  side: 'top' | 'bottom'
}

function resolveBattlefieldCardElement(
  boardElement: HTMLElement | null,
  location: ICardZoneLocation,
): HTMLElement | null {
  return boardElement?.querySelector<HTMLElement>(
    `[data-zone="character-field-card"][data-slot-side="${location.side}"]`
    + `[data-card-instance-id="${location.instanceId}"]`,
  ) ?? null
}

function usePhasePresentationAckEffect({
  isConnected,
  authUserId,
  pendingPresentation,
  acknowledgePhasePresentation,
}: IUsePhasePresentationAckEffectArgs): void {
  const presentationId = pendingPresentation?.presentationId ?? null
  const presentationKind = pendingPresentation?.kind ?? ''
  const isAckOwed = isPresentationAwaitingAck(pendingPresentation, authUserId)

  const seenAtRef = useRef<{ presentationId: string | null; seenAtMs: number }>({
    presentationId: null,
    seenAtMs: 0,
  })

  useEffect(() => {
    if (!isConnected || !presentationId || !isAckOwed) {
      return
    }

    if (seenAtRef.current.presentationId !== presentationId) {
      seenAtRef.current = { presentationId, seenAtMs: Date.now() }
    }

    let isCancelled = false
    let timeoutId = 0

    const resolveAckAtMs = (): number => {
      const nowMs = Date.now()
      pruneSettledFlights(nowMs)

      return resolvePresentationAckAtMs({
        kind: presentationKind,
        seenAtMs: seenAtRef.current.seenAtMs,
        animationsSettleAtMs: resolveFlightsSettleAtMs(nowMs),
      })
    }

    const scheduleAck = (delayMs: number): void => {
      timeoutId = window.setTimeout(() => {
        void (async () => {
          const liveStoreState = useGameHubStore.getState()
          if (liveStoreState.gameState?.pendingPresentation?.presentationId !== presentationId) {
            return
          }

          if (liveStoreState.isActionPending) {
            scheduleAck(PHASE_PRESENTATION_RETRY_MS)
            return
          }

          await whenIdle()

          if (useGameHubStore.getState().gameState?.pendingPresentation?.presentationId !== presentationId) {
            return
          }

          const ackAtMs = resolveAckAtMs()
          const remainingMs = ackAtMs - Date.now()
          if (remainingMs > 0) {
            scheduleAck(remainingMs)
            return
          }

          const wasAcknowledged = await acknowledgePhasePresentation(presentationId)
          if (isCancelled || wasAcknowledged) {
            return
          }

          scheduleAck(PHASE_PRESENTATION_RETRY_MS)
        })()
      }, delayMs)
    }

    scheduleAck(Math.max(0, resolveAckAtMs() - Date.now()))

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [
    acknowledgePhasePresentation,
    authUserId,
    isAckOwed,
    isConnected,
    presentationId,
    presentationKind,
  ])
}

export {
  useIdleRevalidationPoll,
  useAdoptRecordedAnimationEventsOnMount,
  useAdoptRewindPush,
  useCardCatalogPreload,
  useHandZoneAnimationEffects,
  useCardMoveGhostAnimationEffect,
  useDeckSummonFlightEffect,
  useTrashRecallSummonFlightEffect,
  useSupportSummonFlightEffect,
  usePhasePresentationAckEffect,
}