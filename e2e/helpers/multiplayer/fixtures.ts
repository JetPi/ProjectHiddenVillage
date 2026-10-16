import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { API_BASE_URL } from './api'

/**
 * Cards the suite needs but the real catalogue cannot provide.
 *
 * Gamabunta's summon requirement is `Power >= 10` and its `[On Summon]` chain recalls a `[Naruto Uzumaki]` from
 * the trash, and no real card is a normally-summonable 10-power character. Rather than seeding fabricated cards
 * into the catalogue (which every developer's database then carries around), the specs mint them through the
 * admin create endpoint and delete them again, so a fabricated card only ever exists in the e2e database while a
 * test is running.
 *
 * The ids are stable rather than unique per run so a re-run reuses the same rows instead of growing the
 * catalogue; `ensureFixtureCards` brings an existing row back to the shape below.
 */
export const FIXTURE_CARD_IDS = {
  /** A normally summonable Character with `Power >= 10`, so it can be a Gamabunta tribute material. */
  powerMaterial: 'E2E-POWER-10',
  /** A normally summonable [Naruto Uzumaki] with `Power >= 10`: tribute material *and* a legal recall target. */
  recallTarget: 'E2E-RECALL-NARUTO',
} as const

/** The seeded development admin, whose `card_catalog_admin` claim the dev auth bypass honours. */
const ADMIN_USER_ID = '20000000-0000-0000-0000-000000000001'

type FixtureCardDefinition = {
  cardId: string
  displayName: string
  name: string[]
  color: string
  power: number
  damage: number
  health: number
  traits: string[]
  description: string
}

const FIXTURE_CARDS: FixtureCardDefinition[] = [
  {
    cardId: FIXTURE_CARD_IDS.powerMaterial,
    displayName: 'E2E Power Material',
    name: ['E2E Power Material'],
    color: 'Blue',
    power: 10,
    damage: 2,
    health: 4,
    traits: ['Shinobi'],
    description: 'End-to-end fixture: a normally summonable 10-power character for the summon-requirement suites.',
  },
  {
    cardId: FIXTURE_CARD_IDS.recallTarget,
    // The recall filter matches on the card's name, so this fixture has to carry the real one.
    displayName: 'Naruto Uzumaki',
    name: ['Naruto Uzumaki'],
    color: 'Red',
    power: 10,
    damage: 2,
    health: 4,
    traits: ['Shinobi'],
    description: 'End-to-end fixture: a normally summonable [Naruto Uzumaki] with 10 power, so it is both a Gamabunta tribute material and a legal trash recall target.',
  },
]

function adminHeaders(): Record<string, string> {
  return { 'X-Dev-User-Id': ADMIN_USER_ID }
}

/**
 * Creates the fixture cards, or brings an existing row back to the shape above (a re-run reuses the same ids).
 */
export async function ensureFixtureCards(request: APIRequestContext): Promise<void> {
  for (const card of FIXTURE_CARDS) {
    await createOrResetFixtureCard(request, card)
  }
}

/**
 * The dotnet API is still running migrations and seeding when the first spec starts, so the create is retried
 * until the API answers - the same reason `login` retries.
 */
async function createOrResetFixtureCard(
  request: APIRequestContext,
  card: FixtureCardDefinition,
  maxAttempts = 20,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let response

    try {
      response = await request.post(`${API_BASE_URL}/api/card/catalog`, {
        headers: adminHeaders(),
        data: {
          cardId: card.cardId,
          displayName: card.displayName,
          name: card.name,
          type: 'Character',
          color: card.color,
          power: card.power,
          damage: card.damage,
          health: card.health,
          traits: card.traits,
          description: card.description,
          conditions: [],
          effects: [],
        },
      })
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      continue
    }

    if (response.ok()) {
      return
    }

    expect(response.status(), `creating fixture card ${card.cardId}`).toBe(409)

    // A left-over row from an earlier run: reset the fields that are patchable and carry on. Display name and
    // name are not patchable, which is why this helper's definitions must stay stable.
    const patch = await request.patch(
      `${API_BASE_URL}/api/card/catalog/${encodeURIComponent(card.cardId)}/effects`,
      {
        headers: adminHeaders(),
        data: {
          type: 'Character',
          color: card.color,
          power: card.power,
          damage: card.damage,
          health: card.health,
          description: card.description,
        },
      },
    )

    expect(patch.ok(), `resetting fixture card ${card.cardId}`).toBeTruthy()
    return
  }

  throw new Error(`The card API never answered while creating fixture card ${card.cardId}.`)
}

/**
 * Builds a public deck from the given `"<quantity>x <cardId>"` lines and returns its id, so a spec can use a deck
 * composition the seed manifest does not (and must not) contain.
 */
export async function createFixtureDeck(request: APIRequestContext, deckLines: string[]): Promise<string> {
  const response = await request.post(`${API_BASE_URL}/api/deck`, {
    headers: adminHeaders(),
    data: {
      type: 'Public',
      cards: deckLines.join('\n'),
    },
  })

  expect(response.ok(), `creating a fixture deck (${deckLines.join(', ')})`).toBeTruthy()

  const payload = await response.json() as unknown
  const deckId = typeof payload === 'string' ? payload : String(payload)

  expect(deckId.length, 'the deck endpoint should return the id it created').toBeGreaterThan(0)

  return deckId
}

/**
 * Removes the fixture cards again, taking them out of any deck that still lists them.
 *
 * Best effort: a failure here leaves two fabricated cards in the throwaway e2e database, which is untidy but not
 * a broken run, and the next run reuses them.
 */
export async function deleteFixtureCards(request: APIRequestContext): Promise<void> {
  for (const cardId of Object.values(FIXTURE_CARD_IDS)) {
    try {
      await request.delete(
        `${API_BASE_URL}/api/card/catalog/${encodeURIComponent(cardId)}?force=true`,
        { headers: adminHeaders() },
      )
    } catch {
      // Nothing to do: the next run resets the card it finds.
    }
  }
}
