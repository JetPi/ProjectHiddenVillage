import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { CardBack, CardImage } from '@/components/ui/cards'
import { PlayCard } from '@/components/ui/game'
import {
  BOARD_MOVEMENT_EASE,
  CARD_TO_TRASH_FLY_DURATION_MS,
  RESTED_CARD_TILT_DEG,
  RESTED_CARD_TILT_DURATION_MS,
} from '@/views/game/animation/tuning'
import {
  noteFlight,
  resolveCardDepartureDestinationRect,
  resolveCardDepartureZone,
  runElementToRectAnimation,
} from '@/views/game/animation'
import type { ICardDepartureZone } from '@/views/game/animation'
import { twMerge } from 'tailwind-merge'
import type { IGameZonesProps } from '@/views/game/types'
import { LEADER_CARD_IMAGE_CLASS } from '@/views/game/utils/contants'
import { NonLeaderCardOverlay } from './NonLeaderCardOverlay'
import { useGameUIStore } from '@/state/gameUIStore'
import { getBattleTargetHighlightClass, getSummonTargetHighlightClass, toAnchorId, resolveCardActionOptionsForInstanceId, resolveNonLeaderCards } from '@/views/game/utils/functions'

/**
 * A card leaving this row flies as itself.
 *
 * The state update that removes a card has already re-rendered the row by the time any effect could react, so a
 * removed card would have no element left to move and could only be imitated by a copy. The row therefore keeps
 * the removed card rendered for the length of its travel (`departingCards`), which is the retention
 * `AnimatePresence` performs internally - done here because the departing card must be re-rendered with *fresh*
 * props: Motion's cached exiting child would keep the destination it was given while the card was still present,
 * and the movement that names its destination arrives in the very push that removes it.
 *
 * The destination is per card: the events carry one movement per card, so a K.O. travels to its own pile while a
 * card leaving for a zone the board does not render (exile) simply goes.
 */
type IBattlefieldCard = IBattleFieldRowProps['cards'][number]

function BattlefieldCardBody({
  data,
  card,
  index,
  side,
  isDeparting,
}: {
  data: IBattleFieldRowProps
  card: IBattlefieldCard
  index: number
  side: 'top' | 'bottom'
  isDeparting: boolean
}) {
  const { props } = data
  const actionOptions = resolveCardActionOptionsForInstanceId(
    props.availableActions,
    card.instanceId,
    card.availableActions,
  )
  const isBattleTarget = data.validBattleTargetsByCardId.has(card.instanceId.trim().toLowerCase())
  const isTargetCandidate = data.isBattleActionTargeting && isBattleTarget
  const isSummonTarget = data.validSummonTargetsByCardId.has(card.instanceId.trim().toLowerCase())
  const isSummonTargetCandidate = data.isSummonActionTargeting && isSummonTarget
  const summonRequirementText = isSummonTarget
    ? (data.summonRequirementTextByCardInstanceId.get(card.instanceId.trim().toLowerCase()) ?? null)
    : null
  const isSelectedSummonTarget = data.selectedSummonTargetsByCardId.has(card.instanceId.trim().toLowerCase())
  const isEffectTargetCandidate = data.isEffectMultiTargeting
    && data.validEffectTargetsByCardId.has(card.instanceId.trim().toLowerCase())
  const isSelectedEffectTarget = data.selectedEffectTargetsByCardId.has(card.instanceId.trim().toLowerCase())
  const isAttackLinkSource = data.normalizedAttackLinkSourceCardId.length > 0
    && data.normalizedAttackLinkSourceCardId === card.instanceId.trim().toLowerCase()
  const isAttackLinkTarget = data.normalizedAttackLinkTargetCardId.length > 0
    && data.normalizedAttackLinkTargetCardId === card.instanceId.trim().toLowerCase()
  const isCardRested = card.isRested || data.optimisticRestedByInstanceId[card.instanceId] === true
  const shouldDelayRestedDimming = Boolean(props.gameState.isAttackSequencePending) && isAttackLinkSource
  const shouldDimRestedCard = isCardRested && !shouldDelayRestedDimming

  return (
    <PlayCard
      id={isDeparting ? undefined : toAnchorId(card.instanceId)}
      // A departing card keeps its own drawing but stops being a board card: it must not answer locators that
      // count what is on the field while it flies to its pile.
      data-zone={isDeparting ? undefined : 'character-field-card'}
      data-slot-side={isDeparting ? undefined : side}
      data-slot-index={isDeparting ? undefined : index}
      data-card-instance-id={isDeparting ? undefined : card.instanceId}
      className={twMerge(
        'group relative h-full w-full overflow-hidden rounded-lg bg-[var(--surface-elevated)]',
        shouldDimRestedCard ? 'opacity-80 saturate-75' : '',
        isBattleTarget ? getBattleTargetHighlightClass(side) : '',
        isSummonTarget ? getSummonTargetHighlightClass(side) : '',
        isAttackLinkSource || isAttackLinkTarget ? 'attack-link-card-outline' : '',
      )}
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

      {isSelectedSummonTarget || isSelectedEffectTarget ? (
        <div className="card-selection-tint pointer-events-none absolute inset-0 rounded-lg border-2 border-amber-300/95 bg-amber-300/15" />
      ) : null}

      {isDeparting ? null : (
        <NonLeaderCardOverlay
          previewCard={props.derivedGameState.cardById.get(card.cardDefinitionId.trim().toLowerCase()) ?? null}
          card={card}
          zone="battlefield"
          visibilityMode="hover"
          actionOptions={actionOptions}
          isTargetCandidate={isTargetCandidate}
          onChooseTarget={() => props.onSelectAttackTarget(card.instanceId)}
          isSummonTargetCandidate={isSummonTargetCandidate}
          isSummonTargetSelected={isSelectedSummonTarget}
          onToggleSummonTarget={
            isSummonTargetCandidate
              ? () => useGameUIStore.getState().toggleSummonTarget(card.instanceId)
              : undefined
          }
          summonRequirementText={summonRequirementText}
          isEffectTargetCandidate={isEffectTargetCandidate}
          isEffectTargetSelected={isSelectedEffectTarget}
          onToggleEffectTarget={
            isEffectTargetCandidate
              ? () => useGameUIStore.getState().toggleEffectTarget(card.instanceId)
              : undefined
          }
          showEmptyActionMessage={data.isCurrentPlayerZone}
          suppressActionFallback={!data.isCurrentPlayerZone}
          isConnected={props.isConnected}
          isActionPending={props.isActionPending}
          onSelectActionOption={(actionId) => {
            const selectedAction = actionOptions.find((action) => action.actionId === actionId)
            if (!selectedAction) {
              return
            }

            props.onSelectAction(selectedAction)
          }}
        />
      )}
    </PlayCard>
  )
}

function BattlefieldCard({ data, card, index }: { data: IBattleFieldRowProps; card: IBattlefieldCard; index: number }) {
  const side = data.isCurrentPlayerZone ? 'bottom' : 'top'
  const isCardRested = card.isRested || data.optimisticRestedByInstanceId[card.instanceId] === true

  return (
    <motion.div
      // Motion owns the board card's transform: the rested tilt is an animated property here instead of a CSS
      // `transition-transform` class, so nothing else writes `transform`.
      animate={{
        rotate: isCardRested ? RESTED_CARD_TILT_DEG : 0,
        transition: { duration: RESTED_CARD_TILT_DURATION_MS / 1000, ease: BOARD_MOVEMENT_EASE },
      }}
      // `position` only: when a card leaves or joins the row the remaining cards slide into their new slots
      // instead of snapping, and card art is never left at a fractional scale.
      layout="position"
      className="h-full w-auto shrink-0 origin-center aspect-[200/277]"
    >
      <BattlefieldCardBody data={data} card={card} index={index} side={side} isDeparting={false} />
    </motion.div>
  )
}

function DepartingBattlefieldCard({
  data,
  card,
  zone,
  onSettled,
}: {
  data: IBattleFieldRowProps
  card: IBattlefieldCard
  zone: ICardDepartureZone
  onSettled: (cardInstanceId: string) => void
}) {
  const side = data.isCurrentPlayerZone ? 'bottom' : 'top'
  const [element, setElement] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!element) {
      return
    }

    const destinationRect = resolveCardDepartureDestinationRect(zone, side)
    if (!destinationRect) {
      onSettled(card.instanceId)
      return
    }

    let isCancelled = false
    // The acknowledgement waits for this travel like any other flight.
    noteFlight(`field-exit:${card.instanceId}`, Date.now() + CARD_TO_TRASH_FLY_DURATION_MS)
    void runElementToRectAnimation({
      element,
      destinationRect,
      durationMs: CARD_TO_TRASH_FLY_DURATION_MS,
      key: `field-exit:${card.instanceId}`,
    }).finally(() => {
      if (!isCancelled) {
        onSettled(card.instanceId)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [card.instanceId, element, onSettled, side, zone])

  return (
    <motion.div
      ref={setElement}
      // The travelling element carries the card's identity: it is what the flight animates, and it lets a test
      // attribute the travel to a card instead of counting animations.
      data-departing-instance-id={card.instanceId}
      // The card is already off the board, so it takes no part in the row's layout.
      className="pointer-events-none h-full w-auto shrink-0 origin-center aspect-[200/277] z-[250]"
    >
      <BattlefieldCardBody data={data} card={card} index={0} side={side} isDeparting />
    </motion.div>
  )
}

export function BattlefieldRow({ data }: { data: IBattleFieldRowProps }) {
  // The comparison is on *content*, not identity: the card list is rebuilt from the state on every render, so an
  // identity check would set state during render forever.
  const renderedCardsSignature = data.cards.map((card) => card.instanceId).join('|')

  const [retention, setRetention] = useState<{
    signature: string
    cards: IBattlefieldCard[]
    departures: Array<{ card: IBattlefieldCard; zone: ICardDepartureZone }>
  }>(() => ({ signature: renderedCardsSignature, cards: data.cards, departures: [] }))

  // Derived during render, the way AnimatePresence derives its own retained children: without it the row would
  // commit a frame with the card already gone, and a card with no element cannot travel anywhere.
  if (retention.signature !== renderedCardsSignature) {
    const currentInstanceIds = new Set(data.cards.map((card) => card.instanceId))
    const knownDepartureInstanceIds = new Set(retention.departures.map((departure) => departure.card.instanceId))
    const additions = retention.cards.flatMap((card) => {
      if (currentInstanceIds.has(card.instanceId) || knownDepartureInstanceIds.has(card.instanceId)) {
        return []
      }

      const zone = resolveCardDepartureZone(card.instanceId, data.props.gameState.animationEvents)
      // Nothing to animate (exile, or a move the board does not render): drop it straight away.
      return zone ? [{ card, zone }] : []
    })

    setRetention({
      signature: renderedCardsSignature,
      cards: data.cards,
      departures: additions.length > 0 ? [...retention.departures, ...additions] : retention.departures,
    })
  }

  const handleDepartureSettled = useCallback((cardInstanceId: string) => {
    setRetention((previousRetention) => ({
      ...previousRetention,
      departures: previousRetention.departures.filter(
        (departure) => departure.card.instanceId !== cardInstanceId,
      ),
    }))
  }, [])

  const side = data.isCurrentPlayerZone ? 'bottom' : 'top'

  return (
    <div
      data-zone="character-field-row"
      data-slot-side={side}
      className="flex h-full min-h-0 w-full items-center justify-start gap-5 overflow-visible rounded-lg border border-dashed border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-1.5"
    >
      {data.cards.map((card, index) => (
        <BattlefieldCard key={`character-field-${card.instanceId}`} data={data} card={card} index={index} />
      ))}

      {retention.departures.map((departure) => (
        <DepartingBattlefieldCard
          key={`character-field-departing-${departure.card.instanceId}`}
          data={data}
          card={departure.card}
          zone={departure.zone}
          onSettled={handleDepartureSettled}
        />
      ))}
    </div>
  )
}

export type IBattleFieldRowProps = {
  props: IGameZonesProps
  cards: ReturnType<typeof resolveNonLeaderCards>
  isCurrentPlayerZone: boolean
  optimisticRestedByInstanceId: Record<string, boolean>
  validBattleTargetsByCardId: Set<string>
  isBattleActionTargeting: boolean
  validSummonTargetsByCardId: Set<string>
  isSummonActionTargeting: boolean
  summonRequirementTextByCardInstanceId: Map<string, string>
  selectedSummonTargetsByCardId: Set<string>
  isEffectMultiTargeting: boolean
  validEffectTargetsByCardId: Set<string>
  selectedEffectTargetsByCardId: Set<string>
  normalizedAttackLinkSourceCardId: string
  normalizedAttackLinkTargetCardId: string
}
