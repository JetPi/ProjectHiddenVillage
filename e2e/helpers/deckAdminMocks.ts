import type { Page, Route } from '@playwright/test'


type MockCardType = 'Leader' | 'Character' | 'Chakra'

type MockCard = {
  id: string
  displayName: string
  type: MockCardType
  color: 'Red' | 'Blue'
}

const MOCK_CARDS: MockCard[] = [
  { id: 'L-001', displayName: 'Red Leader', type: 'Leader', color: 'Red' },
  { id: 'L-002', displayName: 'Blue Leader', type: 'Leader', color: 'Blue' },
  { id: 'C-001', displayName: 'Red Character', type: 'Character', color: 'Red' },
  { id: 'C-002', displayName: 'Blue Character', type: 'Character', color: 'Blue' },
  { id: 'C-003', displayName: 'Red Backup', type: 'Character', color: 'Red' },
  { id: 'C-004', displayName: 'Red Character 4', type: 'Character', color: 'Red' },
  { id: 'C-005', displayName: 'Red Character 5', type: 'Character', color: 'Red' },
  { id: 'C-006', displayName: 'Red Character 6', type: 'Character', color: 'Red' },
  { id: 'C-007', displayName: 'Red Character 7', type: 'Character', color: 'Red' },
  { id: 'C-008', displayName: 'Red Character 8', type: 'Character', color: 'Red' },
  { id: 'C-009', displayName: 'Red Character 9', type: 'Character', color: 'Red' },
  { id: 'C-010', displayName: 'Red Character 10', type: 'Character', color: 'Red' },
  { id: 'C-011', displayName: 'Red Character 11', type: 'Character', color: 'Red' },
  { id: 'C-012', displayName: 'Red Character 12', type: 'Character', color: 'Red' },
  { id: 'C-013', displayName: 'Red Character 13', type: 'Character', color: 'Red' },
  { id: 'C-014', displayName: 'Red Character 14', type: 'Character', color: 'Red' },
  { id: 'K-001', displayName: 'Red Chakra', type: 'Chakra', color: 'Red' },
]

export type DeckAdminMockCardLine = {
  cardId: string
  quantity: number
}

export type DeckAdminMockDeck = {
  id: string
  name: string
  cards: DeckAdminMockCardLine[]
}

export type DeckAdminMockState = {
  decks: DeckAdminMockDeck[]
  createPayload: { name: string; cards: DeckAdminMockCardLine[] } | null
  updatePayload: { deckId: string; name: string; cards: DeckAdminMockCardLine[] } | null
  deleteRequests: string[]
}

export type IDeckAdminMockOptions = {
  decks?: DeckAdminMockDeck[]
  undeletableDeckId?: string
}

export const MOCK_RULESETS = [
  {
    id: 'ruleset-standard',
    key: 'standard',
    name: 'Standard',
    isActive: true,
    leaderCount: 1,
    nonLeaderCardCount: 50,
    maxCopiesPerNonLeaderCard: 4,
    requireLeaderColorMatch: true,
    allowChakraCards: false,
    allowSummonCards: false,
    sortOrder: 0,
    cardRestrictions: [],
  },
  {
    id: 'ruleset-pre-release',
    key: 'pre-release',
    name: 'Pre-Release',
    isActive: true,
    leaderCount: 1,
    nonLeaderCardCount: 30,
    maxCopiesPerNonLeaderCard: 3,
    requireLeaderColorMatch: true,
    allowChakraCards: false,
    allowSummonCards: false,
    sortOrder: 1,
    cardRestrictions: [],
  },
]

export function buildMockLegalDeckCards(
  nonLeaderCount: number,
  maxCopies = 4,
): DeckAdminMockCardLine[] {
  const cardIds = MOCK_CARDS
    .filter((card) => card.type === 'Character' && card.color === 'Red')
    .map((card) => card.id)
  const cards: DeckAdminMockCardLine[] = []
  let remaining = nonLeaderCount
  let cardIndex = 0

  while (remaining > 0 && cardIds.length > 0) {
    const quantity = Math.min(maxCopies, remaining)
    cards.push({ cardId: cardIds[cardIndex % cardIds.length], quantity })
    remaining -= quantity
    cardIndex += 1
  }

  return cards
}

export function toMockDeckListText(cards: readonly DeckAdminMockCardLine[]): string {
  return cards.map((card) => `${card.quantity}x ${card.cardId}`).join('\n')
}

function findMockCard(cardId: string): MockCard {
  return findMockCardOrNull(cardId) ?? MOCK_CARDS[0]
}

function findMockCardOrNull(cardId: string): MockCard | null {
  return MOCK_CARDS.find((card) => card.id.toLowerCase() === cardId.trim().toLowerCase()) ?? null
}

function toCatalogItem(card: MockCard) {
  return {
    id: card.id,
    image: '',
    imageVersion: 1,
    name: [],
    displayName: card.displayName,
    type: card.type,
    traits: [],
    color: card.color,
    description: '',
    damage: 0,
    power: 0,
    conditions: [],
    effects: [],
    life: null,
    health: null,
    cannotBeNormalSummoned: false,
    supportName: null,
    supportEffect: null,
    supportCost: null,
  }
}

function toDeckResponse(deck: DeckAdminMockDeck, populate: boolean) {
  const leaderLine = deck.cards
    .map((card) => ({ card, metadata: findMockCardOrNull(card.cardId) }))
    .find((entry) => entry.metadata?.type === 'Leader')

  return {
    id: deck.id,
    name: deck.name,
    type: 'Public',
    userId: null,
    leaderColor: leaderLine?.metadata?.color ?? null,
    cards: deck.cards.map((card) => ({
      cardId: card.cardId,
      quantity: card.quantity,
      ...(populate ? { card: toCatalogItem(findMockCard(card.cardId)) } : {}),
    })),
  }
}

function corsHeaders(route: Route): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': route.request().headers()['origin'] ?? 'http://127.0.0.1:4173',
    'Access-Control-Allow-Credentials': 'true',
  }
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: corsHeaders(route),
    body: JSON.stringify(body),
  })
}

async function handlePreflight(route: Route): Promise<boolean> {
  if (route.request().method() !== 'OPTIONS') {
    return false
  }

  await route.fulfill({
    status: 204,
    headers: {
      ...corsHeaders(route),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization',
    },
  })

  return true
}

export async function installDeckAdminMocks(
  page: Page,
  options: IDeckAdminMockOptions = {},
): Promise<DeckAdminMockState> {
  const state: DeckAdminMockState = {
    decks: options.decks ?? [],
    createPayload: null,
    updatePayload: null,
    deleteRequests: [],
  }

  await page.route('**/api/card/catalog**', async (route) => {
    if (await handlePreflight(route)) {
      return
    }

    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname.endsWith('/by-ids')) {
      const requestedIds = (request.postDataJSON() as string[] | null) ?? []
      const cards = requestedIds.map((cardId) => toCatalogItem(findMockCard(cardId)))

      await fulfillJson(route, 200, cards)
      return
    }

    if (url.pathname !== '/api/card/catalog') {
      await route.continue()
      return
    }

    const pageNumber = Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1
    const pageSize = Number.parseInt(url.searchParams.get('pageSize') ?? '100', 10) || 100
    const search = url.searchParams.get('search')?.trim().toLowerCase() ?? ''
    const selectedTypes = new Set(
      url.searchParams
        .getAll('types')
        .flatMap((value) => value.split(','))
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
    )
    const matchingCards = MOCK_CARDS.filter((card) =>
      (selectedTypes.size === 0 || selectedTypes.has(card.type.toLowerCase()))
      && (search.length === 0
        || card.id.toLowerCase().includes(search)
        || card.displayName.toLowerCase().includes(search)))

    await fulfillJson(route, 200, {
      page: pageNumber,
      pageSize,
      totalCount: matchingCards.length,
      totalPages: 1,
      items: matchingCards.map((card) => toCatalogItem(card)),
    })
  })

  await page.route('**/api/deck**', async (route) => {
    if (await handlePreflight(route)) {
      return
    }

    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const segments = url.pathname.split('/').filter((segment) => segment.length > 0)
    const deckId = segments.length > 2 ? decodeURIComponent(segments[2]) : null

    if (url.pathname === '/api/deck' && method === 'GET') {
      await fulfillJson(route, 200, state.decks.map((deck) => toDeckResponse(deck, false)))
      return
    }

    if (url.pathname === '/api/deck/public' && method === 'POST') {
      const payload = request.postDataJSON() as { name: string; cards: DeckAdminMockCardLine[] }
      state.createPayload = payload

      const createdDeck: DeckAdminMockDeck = {
        id: `mock-deck-${state.decks.length + 1}`,
        name: payload.name,
        cards: payload.cards,
      }
      state.decks.push(createdDeck)

      await fulfillJson(route, 201, toDeckResponse(createdDeck, false))
      return
    }

    if (deckId && method === 'GET') {
      const deck = state.decks.find((candidate) => candidate.id === deckId)
      if (!deck) {
        await fulfillJson(route, 404, 'Deck not found.')
        return
      }

      const populate = url.searchParams.get('populate') === 'true'
      await fulfillJson(route, 200, toDeckResponse(deck, populate))
      return
    }

    if (deckId && method === 'PUT') {
      const payload = request.postDataJSON() as { name: string; cards: DeckAdminMockCardLine[] }
      state.updatePayload = { deckId, ...payload }

      const deck = state.decks.find((candidate) => candidate.id === deckId)
      if (!deck) {
        await fulfillJson(route, 404, 'Deck not found.')
        return
      }

      deck.name = payload.name
      deck.cards = payload.cards

      await fulfillJson(route, 200, toDeckResponse(deck, false))
      return
    }

    if (deckId && method === 'DELETE') {
      state.deleteRequests.push(deckId)

      if (options.undeletableDeckId === deckId) {
        await fulfillJson(route, 409, `Deck '${deckId}' is assigned to a game instance.`)
        return
      }

      state.decks = state.decks.filter((deck) => deck.id !== deckId)
      await route.fulfill({ status: 204, headers: corsHeaders(route) })
      return
    }

    await route.continue()
  })

  await page.route('**/api/deck-rulesets**', async (route) => {
    if (await handlePreflight(route)) {
      return
    }

    const url = new URL(route.request().url())
    const includeInactive = url.pathname.endsWith('/all')

    await fulfillJson(
      route,
      200,
      includeInactive ? MOCK_RULESETS : MOCK_RULESETS.filter((ruleset) => ruleset.isActive),
    )
  })

  return state
}
