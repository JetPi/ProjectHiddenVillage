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
  IUseCardMoveGhostAnimationEffectArgs,
  IUseHandZoneAnimationEffectsArgs,
  IUsePhasePresentationAckEffectArgs,
  IUseRevealedCardSummonFlightEffectArgs,
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
  TRASH_RECALL_SUMMON_FLIGHT_DURATION_MS,
} from '@/views/game/animation/tuning'
import { cancelAllFlights } from '@/views/game/animation/flightRegistry'

const STATIC_GAME_IMAGE_SOURCES = [chakraCardImage, summonCardImage, cardBackImage]

/**
 * Where a card was rendered when the last snapshot was taken, so its exit can start from the exact spot
 * it disappeared from (the game state that removed it already re-rendered the board by then).
 */
type ICardRenderedZone = 'battlefield' | 'support' | 'hand'

/**
 * Geometry only: the card's own element carries the art, the face and the styling, so a snapshot no longer has
 * to remember what the card looked like (and a face-down card can be flied too - it has no `<img>` to snapshot).
 */
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

/**
 * The hand-affecting movements the engine recorded, consuming the events so the republished tail is only ever
 * animated once.
 *
 * A movement's side is implicit: the event's card is looked up in that side's own zone instance ids, so a move for
 * the other player simply does not match and no player-id comparison is needed. Returns null when the push carried
 * no usable events - which is exactly when the caller falls back to inferring the moves from count/zone deltas.
 */
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

    // Only an event this consumer actually *acts on* is claimed. Several consumers read the same republished
    // tail in the same commit, so claiming every event here would starve the others.
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

/**
 * The first recorded summon out of a deck this client has not claimed yet, claimed by this call. Same
 * claim-what-you-act-on rule as the hand consumer: the republished tail is shared by every consumer.
 */
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

/** Which side of the board a movement's player sits on, or null when the id matches neither player. */
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

/**
 * Holds an arriving card back so it cannot be painted at its resting spot before its flight starts.
 *
 * The marker is CSS (`[data-card-arrival-pending]` in `index.css`): the card is not painted at all while it is
 * held, and the slot's Motion mount fade is neutralised at the same time, because the flight - not the mount -
 * is what should reveal the card. Releasing it is a plain attribute removal, done in the same task that starts
 * the flight, so no frame can be painted in between.
 */
function markCardAwaitingArrival(instanceId: string, handRowRef: RefObject<HTMLDivElement | null>): void {
  handRowRef.current
    ?.querySelector<HTMLElement>(`[data-hand-instance-id="${instanceId}"]`)
    ?.setAttribute('data-card-arrival-pending', 'true')
}

function releaseCardAwaitingArrival(instanceId: string, handRowRef: RefObject<HTMLDivElement | null>): void {
  handRowRef.current
    ?.querySelector<HTMLElement>(`[data-hand-instance-id="${instanceId}"]`)
    ?.removeAttribute('data-card-arrival-pending')
}

/** Drops every hold in a row - the safety net, so a cancelled batch can never strand an invisible card. */
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
  // A layout effect on purpose: it runs after React has mounted the pushed hand but *before* the browser paints
  // it, which is the only moment at which the arriving cards can still be held back from their first paint. Under
  // the same commit the flights below are only *scheduled* (each one waits out its stagger), so the hold is what
  // keeps a waiting card out of sight until its own flight releases it.
  useLayoutEffect(() => {
    const animController = animControllerRef.current
    const previousSnapshot = animController.previousHandZoneSnapshot
    const nextTopHandInstanceIdSet = new Set(topHandInstanceIds)
    const nextBottomHandInstanceIdSet = new Set(bottomHandInstanceIds)
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
      // A draw or a discard is animated because the engine recorded which card moved, not because a new hand card
      // happened to appear alongside a count drop. The count/zone inference below stays as the fallback for a push
      // that carries no events (an older server, or a state no movement was recorded for).
      const recordedMovements = consumeRecordedHandMovements(animController, animationEvents, {
        topHand: topHandInstanceIds,
        bottomHand: bottomHandInstanceIds,
        topTrash: topTrashInstanceIds,
        bottomTrash: bottomTrashInstanceIds,
      })
      const topDeckToHandCards = recordedMovements?.drawnTop.length
        ? recordedMovements.drawnTop
        : newTopHandCards.slice(0, topDeckDecrease)
      const bottomDeckToHandCards = animController.pendingMulliganDrawReplay
        ? bottomHandInstanceIds
        : recordedMovements?.drawnBottom.length
          ? recordedMovements.drawnBottom
          : newBottomHandCards.slice(0, bottomDeckDecrease)
      // The count/zone inference (a removed hand card that is *in* the trash now) is the shape that used to
      // mis-attribute a summon's hand exit to whatever else grew the trash in the same push - a tribute material
      // coming off the field. It stays only as the fallback; the engine's recorded discard is the real source.
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

      // The holds go on before anything is scheduled: every arriving card is marked here, and each of the flights
      // below removes its own marker as it starts. A card that leaves the row while still held cannot strand
      // invisibly - it is no longer in the hand for the marker to matter, and both the cleanup paths below drop
      // the holds explicitly.
      topDeckToHandCards.forEach((instanceId) => markCardAwaitingArrival(instanceId, topHandRowRef))
      bottomDeckToHandCards.forEach((instanceId) => markCardAwaitingArrival(instanceId, bottomHandRowRef))

      if (animController.pendingMulliganDrawReplay) {
        animController.pendingMulliganDrawReplay = false
      }

      function runInferredHandToTrashAnimation(side: 'top' | 'bottom', cardInstanceId: string): void {
        // A discard the client already flew itself - before it submitted, so the hand card was still mounted -
        // claims the card here. Without this the same move would be animated twice: once by that flight, and
        // again by this one, because the hand row is still holding the card in its exit window.
        if (animController.suppressedExitGhostInstanceIds.delete(cardInstanceId)) {
          return
        }

        const sourceHandRowElement = side === 'top' ? topHandRowRef.current : bottomHandRowRef.current
        const sourceCardElement = sourceHandRowElement?.querySelector<HTMLDivElement>(
          `[data-hand-instance-id="${cardInstanceId}"]`,
        ) ?? null

        // The hand row keeps a removed card mounted while it exits, so within that window the discarded card is
        // still a live element and travels to the pile as itself. Once the element is gone there is nothing left
        // to move - drawing a copy of a card the player can no longer see is worse than no animation at all.
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
          // A discard is an animation like the draw: the phase-presentation acknowledgement has to wait for
          // the last card to land in its pile, not just for the deck→hand flights.
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
        // The deck→hand flight is the one animation the phase-presentation acknowledgement must never cut:
        // a draw presentation is exactly "the cards are arriving in the hand".
        noteFlight('draw', animController.drawAnimationEndsAt)

        animController.pendingDrawAnimationFrameId = window.requestAnimationFrame(() => {
          topDeckToHandCards.forEach((instanceId, index) => {
            const movementDelay = index * drawToHandStaggerMs
            const timeoutId = window.setTimeout(() => {
              // Release first, in the same task as the flight's first step: no frame can be painted between the
              // hold coming off and the flight offsetting the card, so the card is never seen at its resting spot.
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

      // A cancelled batch must never strand a held card: the holds come off with the same teardown that cancels
      // the flights which would have released them.
      releaseAllCardArrivals(topHandRowRef)
      releaseAllCardArrivals(bottomHandRowRef)

      // The board is being torn down: no flight may outlive it (its ghost would be orphaned in the DOM), and the
      // director's flight registry must not leak deadlines into a remount.
      cancelAllFlights()
      clearFlights()
    }
  }, [animControllerRef, bottomHandRowRef, topHandRowRef])
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

      // A card leaving the character field is owned by that row: it retains the element and travels it to the
      // pile itself, so a flight here would draw the same move twice.
      if (snapshot.zone === 'battlefield') {
        continue
      }

      // A card the hand row is still holding (it keeps a removed card mounted for a moment) is flown by that row
      // as the card itself - the better flight, because it is the card rather than a stand-in for it. Checked
      // here instead of by claim so the two effects do not depend on the order they run in.
      const handRowStillHoldsCard = [topHandRowRef.current, bottomHandRowRef.current].some((handRow) => {
        return handRow?.querySelector(`[data-hand-instance-id="${instanceId}"]`) != null
      })
      if (snapshot.zone === 'hand' && handRowStillHoldsCard) {
        continue
      }

      const movementDelay = flyingIndex * CARD_TO_TRASH_STAGGER_MS
      flyingIndex += 1

      const timeoutId = window.setTimeout(() => {
        // The card that travels is whatever the board renders now: the arriving hand card, or the card that has
        // just landed on top of the trash pile (the pile's own slot element, which shows it). A real element at
        // this end of the motion either way - `runElementFromRectAnimation` offsets it back to where the card
        // came from, so the move reads as the card itself having travelled.
        void runElementFromRectAnimation({
          element: destinationElement,
          sourceRect: snapshot.rect,
          durationMs: CARD_TO_TRASH_FLY_DURATION_MS,
          key: instanceId,
        })
      }, movementDelay)
      animController.pendingDrawTimeoutIds.push(timeoutId)
      // A card flying to its new zone is part of the transition the engine is waiting on: register the flight
      // so the acknowledgement cannot cut it in half.
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

/**
 * Flies a card summoned out of a deck onto the field.
 *
 * The engine records the movement (`summon` from `deck`), which is exactly what a "Reveal First" chain that
 * summons its revealed card does - and which also covers a search-and-summon, a case the old "the deck card is
 * flagged `isRevealed`" heuristic missed entirely. A deck card is drawn by the pile rather than as a card face,
 * so the generic move effect has no snapshot to fly from; the deck slot is this flight's source.
 */
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

    // The real battlefield card travels from the deck slot: it is the entity that stays, so no copy is drawn
    // and nothing has to be hidden and revealed around it (the old path drew a copy *and* hid this card, which
    // is exactly the duplicate this replaced).
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

/**
 * Flies a card summoned straight out of the trash (Gamabunta's "[On Summon] summon 1 ... from your trash") from
 * the trash slot onto its owner's character field. The generic move-ghost effect cannot animate a trash→field
 * move: a trash card is drawn as a pile tile rather than a card face (so there is no board/hand snapshot to fly
 * from), and the summon only ever places the card on the character field. The flight is driven by the trash list
 * itself: a card that was in the trash last render is now off it and has a character-field element.
 */
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

    // The very first pass establishes the baseline: nothing has left the trash yet.
    if (!previousTrash) {
      return
    }

    const flyFromTrashSlot = (side: 'top' | 'bottom'): void => {
      const trashSlotElement = side === 'top' ? topTrashCardRef.current : bottomTrashCardRef.current
      if (!trashSlotElement) {
        return
      }

      for (const instanceId of previousTrash[side]) {
        // Still in the trash: this card did not leave it this render.
        if (nextTrash[side].has(instanceId)) {
          continue
        }

        const location: ICardZoneLocation = { instanceId, side }
        if (!resolveBattlefieldCardElement(boardZoneRef.current, location)) {
          continue
        }

        // The real battlefield card travels from the trash slot - the entity that stays is the thing that moves.
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

/** A card on one side of the board: its instance id and which rail it sits on. */
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

/**
 * Answers the engine's phase presentation: the engine performed a transition on its own and holds the table
 * until every connected client says its board has finished showing it. This client only answers for itself
 * ("is it in `requiredAckPlayerIds` and not in `acknowledgedPlayerIds` yet") and it only answers once the
 * transition is actually over on screen - the board's own animations plus a per-kind minimum - because the
 * acknowledgement is what lets the engine take the next step.
 *
 * It must never look like a player action: it does not go through `submitHubIntent`, so it never sets
 * `isActionPending` and the buttons, the prompt UI and the phase row are not restyled by it.
 */
function usePhasePresentationAckEffect({
  isConnected,
  authUserId,
  pendingPresentation,
  acknowledgePhasePresentation,
}: IUsePhasePresentationAckEffectArgs): void {
  const presentationId = pendingPresentation?.presentationId ?? null
  const presentationKind = pendingPresentation?.kind ?? ''
  const isAckOwed = isPresentationAwaitingAck(pendingPresentation, authUserId)

  /** When this client first saw the presentation: the minimum display window is measured from here. */
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
          // Re-read the live snapshot: a submit of this client's own, a newer presentation, or a state pull
          // may have landed while the timer ran, and only the presentation this timer was armed for may be
          // acknowledged from here.
          const liveStoreState = useGameHubStore.getState()
          if (liveStoreState.gameState?.pendingPresentation?.presentationId !== presentationId) {
            return
          }

          if (liveStoreState.isActionPending) {
            // The engine rejects every other mutation while a presentation is pending, but a submit already in
            // flight still owns the board: let it settle before answering.
            scheduleAck(PHASE_PRESENTATION_RETRY_MS)
            return
          }

          // Wait for the director's queue to drain before answering: the acknowledgement is the engine's gate,
          // and a card still in the air must not be cut in half.
          await whenIdle()

          // The wait may have spanned a state push: only the presentation this timer was armed for may be
          // acknowledged, and a submit that landed meanwhile still owns the board.
          if (useGameHubStore.getState().gameState?.pendingPresentation?.presentationId !== presentationId) {
            return
          }

          const ackAtMs = resolveAckAtMs()
          const remainingMs = ackAtMs - Date.now()
          if (remainingMs > 0) {
            // The board is still animating (or the kind's minimum window has not elapsed): wait for whichever
            // of the two is the real end of the transition instead of cutting it.
            scheduleAck(remainingMs)
            return
          }

          const wasAcknowledged = await acknowledgePhasePresentation(presentationId)
          if (isCancelled || wasAcknowledged) {
            return
          }

          // The acknowledgement was refused (a superseded presentation, a transient failure): re-check while
          // the same presentation is still the one the engine is waiting on, so a single dropped call cannot
          // leave the table parked.
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
  useCardCatalogPreload,
  useHandZoneAnimationEffects,
  useCardMoveGhostAnimationEffect,
  useDeckSummonFlightEffect,
  useTrashRecallSummonFlightEffect,
  usePhasePresentationAckEffect,
}