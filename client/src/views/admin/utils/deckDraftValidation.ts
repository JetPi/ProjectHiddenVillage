import type {
  IDeckAdminCardMetadata,
  IDeckAdminDraft,
  IDeckAdminNameViolation,
  IDeckAdminSelectedCard,
} from '@/views/admin/types/deckAdminTypes'

export const MAX_DECK_NAME_LENGTH = 128

const LEADER_TYPE = 'leader'

export { normalizeDeckCardId } from '@/domain/deck/parseDeckList'

export function isLeaderCard(card: IDeckAdminCardMetadata | null | undefined): boolean {
  return (card?.type ?? '').trim().toLowerCase() === LEADER_TYPE
}

export function buildDeckDraftNameViolations(name: string): IDeckAdminNameViolation[] {
  const trimmedName = name.trim()

  if (trimmedName.length === 0) {
    return [{ code: 'nameRequired', messageKey: 'admin.decks.validation.nameRequired' }]
  }

  if (trimmedName.length > MAX_DECK_NAME_LENGTH) {
    return [
      {
        code: 'nameTooLong',
        messageKey: 'admin.decks.validation.nameTooLong',
        params: { max: MAX_DECK_NAME_LENGTH },
      },
    ]
  }

  return []
}

export function buildSelectedDeckCards(
  draft: IDeckAdminDraft,
  cardsById: ReadonlyMap<string, IDeckAdminCardMetadata>,
  maxCopies: number,
): IDeckAdminSelectedCard[] {
  return [...draft.quantitiesByCardId.entries()]
    .filter(([, quantity]) => quantity > 0)
    .filter(([cardId]) => !isLeaderCard(cardsById.get(cardId)))
    .map(([cardId, quantity]) => ({
      cardId,
      metadata: cardsById.get(cardId) ?? null,
      quantity,
      isLeader: false,
      exceedsCopyLimit: quantity > maxCopies,
    }))
    .sort((left, right) => {
      const leftName = left.metadata?.displayName ?? left.cardId
      const rightName = right.metadata?.displayName ?? right.cardId

      return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' })
    })
}

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

export function buildDeckDraftSignature(draft: IDeckAdminDraft): string {
  const lines = [...draft.quantitiesByCardId.entries()]
    .filter(([, quantity]) => quantity > 0)
    .map(([cardId, quantity]) => `${cardId}x${quantity}`)
    .sort()

  return `${draft.name.trim()}|${lines.join(',')}`
}
