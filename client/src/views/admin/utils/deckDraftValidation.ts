import type {
  IDeckAdminCardMetadata,
  IDeckAdminDraft,
  IDeckAdminSelectedCard,
  IDeckAdminValidationResult,
  IDeckAdminViolation,
} from '@/views/admin/types/deckAdminTypes'

/** Mirrors `DeckConfiguration.Name`, and the server's `DeckWriteShapeRules`. */
export const MAX_DECK_NAME_LENGTH = 128

/** Mirrors `PublicDeckRules.MaxNonLeaderCopies`. */
export const MAX_NON_LEADER_COPIES = 4

const LEADER_TYPE = 'leader'
const NON_DECKABLE_TYPES = new Set(['chakra', 'summon'])

/** One normalisation for card ids across the builder, so a tile and a loaded deck agree on identity. */
export function normalizeDeckCardId(cardId: string): string {
  return cardId.trim().toLowerCase()
}

export function isLeaderCard(card: IDeckAdminCardMetadata | null | undefined): boolean {
  return (card?.type ?? '').trim().toLowerCase() === LEADER_TYPE
}

export function isNonDeckableCard(card: IDeckAdminCardMetadata | null | undefined): boolean {
  return NON_DECKABLE_TYPES.has((card?.type ?? '').trim().toLowerCase())
}

/** Normalises the catalogue into the lookup the rules and the editor read, keyed by lowercase card id. */
export function buildDeckCardMetadataMap(
  cards: ReadonlyArray<IDeckAdminCardMetadata>,
): Map<string, IDeckAdminCardMetadata> {
  const metadataByCardId = new Map<string, IDeckAdminCardMetadata>()

  for (const card of cards) {
    const normalizedCardId = normalizeDeckCardId(card.id)
    if (normalizedCardId && !metadataByCardId.has(normalizedCardId)) {
      metadataByCardId.set(normalizedCardId, card)
    }
  }

  return metadataByCardId
}

/**
 * The deck rules, evaluated over the draft exactly as the server evaluates them over the payload. A violation
 * here means the save button is disabled; the server still re-runs the same rules on save, because a card can be
 * deleted by another author between the read that filled this map and the write.
 */
export function evaluateDeckDraft(
  draft: IDeckAdminDraft,
  cardsById: ReadonlyMap<string, IDeckAdminCardMetadata>,
): IDeckAdminValidationResult {
  const violations: IDeckAdminViolation[] = []
  const trimmedName = draft.name.trim()

  if (trimmedName.length === 0) {
    violations.push({ code: 'nameRequired', messageKey: 'admin.decks.validation.nameRequired' })
  } else if (trimmedName.length > MAX_DECK_NAME_LENGTH) {
    violations.push({
      code: 'nameTooLong',
      messageKey: 'admin.decks.validation.nameTooLong',
      params: { max: MAX_DECK_NAME_LENGTH },
    })
  }

  const entries = [...draft.quantitiesByCardId.entries()]
    .filter(([, quantity]) => quantity > 0)
    .sort(([left], [right]) => left.localeCompare(right))

  if (entries.length === 0) {
    violations.push({ code: 'deckEmpty', messageKey: 'admin.decks.validation.deckEmpty' })
    return { isValid: false, violations }
  }

  const unknownCardIds = entries
    .filter(([cardId]) => !cardsById.has(cardId))
    .map(([cardId]) => cardId)

  if (unknownCardIds.length > 0) {
    violations.push({
      code: 'unknownCards',
      messageKey: 'admin.decks.validation.unknownCards',
      params: { cardIds: unknownCardIds.join(', ') },
    })
  }

  // Everything below is about cards the catalogue answered for; an unknown id has no type or colour to judge.
  const knownCards = entries
    .map(([cardId, quantity]) => ({ card: cardsById.get(cardId), cardId, quantity }))
    .filter((entry): entry is { card: IDeckAdminCardMetadata; cardId: string; quantity: number } =>
      entry.card !== undefined)
    .map((entry) => ({
      cardId: entry.card.id,
      type: entry.card.type.trim().toLowerCase(),
      color: entry.card.color,
      quantity: entry.quantity,
    }))

  const prohibitedCardIds = knownCards
    .filter((entry) => NON_DECKABLE_TYPES.has(entry.type))
    .map((entry) => entry.cardId)

  if (prohibitedCardIds.length > 0) {
    violations.push({
      code: 'unsupportedCardType',
      messageKey: 'admin.decks.validation.unsupportedCardType',
      params: { cardIds: prohibitedCardIds.join(', ') },
    })
  }

  const leaders = knownCards.filter((entry) => entry.type === LEADER_TYPE)

  if (leaders.length !== 1) {
    violations.push({
      code: 'leaderCount',
      messageKey: 'admin.decks.validation.leaderCount',
      params: { count: leaders.length },
    })
  } else {
    const leader = leaders[0]

    if (leader.quantity !== 1) {
      violations.push({
        code: 'leaderCopies',
        messageKey: 'admin.decks.validation.leaderCopies',
        params: { cardId: leader.cardId, quantity: leader.quantity },
      })
    }

    const mismatchedCardIds = knownCards
      .filter((entry) => entry.type !== LEADER_TYPE && entry.color !== leader.color)
      .map((entry) => entry.cardId)

    if (mismatchedCardIds.length > 0) {
      violations.push({
        code: 'colorMismatch',
        messageKey: 'admin.decks.validation.colorMismatch',
        params: { color: leader.color, cardIds: mismatchedCardIds.join(', ') },
      })
    }
  }

  const overCopiedCardIds = knownCards
    .filter((entry) => entry.type !== LEADER_TYPE && entry.quantity > MAX_NON_LEADER_COPIES)
    .map((entry) => `${entry.cardId} (${entry.quantity})`)

  if (overCopiedCardIds.length > 0) {
    violations.push({
      code: 'tooManyCopies',
      messageKey: 'admin.decks.validation.tooManyCopies',
      params: { max: MAX_NON_LEADER_COPIES, cardIds: overCopiedCardIds.join(', ') },
    })
  }

  return { isValid: violations.length === 0, violations }
}

/**
 * The deck's card lines, by name. The leader is deliberately absent: it lives in its own slot (see
 * {@link buildDeckLeaderCard}), which is what makes a second leader impossible rather than merely invalid.
 */
export function buildSelectedDeckCards(
  draft: IDeckAdminDraft,
  cardsById: ReadonlyMap<string, IDeckAdminCardMetadata>,
): IDeckAdminSelectedCard[] {
  return [...draft.quantitiesByCardId.entries()]
    .filter(([, quantity]) => quantity > 0)
    .filter(([cardId]) => !isLeaderCard(cardsById.get(cardId)))
    .map(([cardId, quantity]) => ({
      cardId,
      metadata: cardsById.get(cardId) ?? null,
      quantity,
      isLeader: false,
      exceedsCopyLimit: quantity > MAX_NON_LEADER_COPIES,
    }))
    .sort((left, right) => {
      const leftName = left.metadata?.displayName ?? left.cardId
      const rightName = right.metadata?.displayName ?? right.cardId

      return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' })
    })
}

/**
 * The deck's leader, or null. A leader line that reached the draft another way (a legacy deck, a paste) still
 * renders here - the first one wins - so the slot always reflects what the deck would be saved with.
 */
export function buildDeckLeaderCard(
  draft: IDeckAdminDraft,
  cardsById: ReadonlyMap<string, IDeckAdminCardMetadata>,
): IDeckAdminSelectedCard | null {
  for (const [cardId, quantity] of draft.quantitiesByCardId.entries()) {
    const metadata = cardsById.get(cardId) ?? null

    if (quantity > 0 && isLeaderCard(metadata)) {
      return {
        cardId,
        metadata,
        quantity,
        isLeader: true,
        exceedsCopyLimit: false,
      }
    }
  }

  return null
}

/**
 * A stable value for dirty tracking: two drafts with the same name and card lines are the same deck, whatever
 * order a Map happens to iterate in.
 */
export function buildDeckDraftSignature(draft: IDeckAdminDraft): string {
  const lines = [...draft.quantitiesByCardId.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([cardId, quantity]) => `${cardId}x${quantity}`)
    .sort()

  return `${draft.name.trim()}|${lines.join(',')}`
}
