import { expect } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'
import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  /**
   * A normally summonable 10-power Character whose own continuous passive grants it [Rush] on its controller's
   * turn. A scenario that has to *attack with the card it just summoned* needs one, and no seeded card can do
   * that: `N-007` only gains [Rush] at 10+ power (it prints 8) and `N-011` needs two specific allies on the field.
   */
  rushCharacter: 'E2E-RUSH-10',
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
  /** Effect specs, in the catalogue's authoring shape. Omitted when the card needs none. */
  effects?: Record<string, unknown>[]
}

/**
 * `N-007`'s `gain-rush` passive, copied verbatim from the seed catalogue.
 *
 * A continuous, self-targeted [Rush] grant while the source card's power is 10 or more, on its controller's turn.
 * Reusing the real card's authored effect (rather than inventing an interaction) keeps the fixture behaving
 * exactly like the conditional-Rush card the rules already cover.
 */
const RUSH_ON_TEN_POWER_EFFECTS: Record<string, unknown>[] = [
  {
    id: 'gain-rush',
    isSubordinate: false,
    onSuccessEffectId: null,
    onFailureEffectId: null,
    runtimeEffectType: 'Gain Effect',
    effectType: 'Activated',
    timing: 'Your Turn',
    durationMode: 'Instant',
    passiveMode: 'Continuous',
    passiveReevaluation: {
      triggerKinds: ['Any'],
      scope: 'Source Card Only',
    },
    passiveConsequences: [
      {
        consequenceEffectTypeKey: 'GainKeyword',
        targetPolicy: 'Source Card',
        consequenceArguments: {},
      },
    ],
    keywordModifications: [
      {
        targetType: 'Source Card',
        operation: 'Add',
        keyword: 'Rush',
      },
    ],
    targetRange: 'Self',
    isOptional: false,
    chakraCost: null,
    globalRestrictions: 'None',
    executionTargetSource: 'Selected Targets',
    executionFlowMode: 'Per Step',
    suppressSummonedTargetsEffectsWhileOnField: false,
    revealTimingMode: 'Reveal Last',
    revealPostConditionRuleSet: null,
    revealPostConditionRestriction: null,
    revealPostConditionPredicate: null,
    executionCondition: null,
    attributeModifications: [],
    chakraAdjustments: [],
    summonCardFlips: [],
    faceStateLocks: [],
    moveCardActions: [],
    contextRules: [],
    targetRules: {
      operator: 'All',
      exactTargetCount: 1,
      minimumTargetCount: null,
      maximumTargetCount: null,
      autoSelectAllValidTargets: false,
      tributeComposition: null,
      rules: [
        {
          scope: 'Self',
          inZone: 'Character Field',
          locationSelector: {
            kind: 'Any',
            supportSlotIndex: null,
          },
          tributeRole: null,
          exactSelectedTargetCount: 1,
          minimumSelectedTargetCount: null,
          maximumSelectedTargetCount: null,
          restriction: {
            predicates: [
              {
                property: 'Power',
                operator: 'Greater Than Or Equal',
                value: '10',
                values: [],
                ignoreCase: true,
              },
              {
                property: 'Self',
                operator: 'Equals',
                value: '',
                values: [],
                ignoreCase: true,
              },
            ],
            matchMode: 'All',
          },
        },
      ],
    },
  },
]

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
  {
    cardId: FIXTURE_CARD_IDS.rushCharacter,
    displayName: 'E2E Rush Character',
    name: ['E2E Rush Character'],
    color: 'Blue',
    power: 10,
    damage: 2,
    health: 4,
    traits: ['Shinobi'],
    description: 'End-to-end fixture: a normally summonable 10-power character that gains [Rush] on its controller\'s turn.',
    effects: RUSH_ON_TEN_POWER_EFFECTS,
  },
]

function adminHeaders(): Record<string, string> {
  return { 'X-Dev-User-Id': ADMIN_USER_ID }
}

/**
 * Creates the chosen fixture cards, or brings an existing row back to the shape above (a re-run reuses the same
 * ids).
 *
 * Specs pass the ids they actually use. Files run in parallel, so a spec that cleaned up *every* fixture would
 * delete a card another file is mid-scenario with.
 */
export async function ensureFixtureCards(
  request: APIRequestContext,
  cardIds: string[] = Object.values(FIXTURE_CARD_IDS),
): Promise<void> {
  for (const card of FIXTURE_CARDS) {
    if (!cardIds.includes(card.cardId)) {
      continue
    }

    await resetFixtureCardWithRetry(request, card)
  }
}

/**
 * Provisions one fixture card, retrying the create-or-reset a couple of times.
 *
 * This is the only retry left in the fixture helpers, and it is safe because the operation is idempotent: it writes
 * a fixed shape. Two workers can legitimately run the same spec file at once (`--repeat-each`), and the loser of the
 * create race then patches a row the winner may still be writing. Retrying a *game* mutation on the other hand
 * could apply it twice, which is why nothing else here retries.
 */
async function resetFixtureCardWithRetry(
  request: APIRequestContext,
  card: FixtureCardDefinition,
  maxAttempts = 3,
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await createOrResetFixtureCard(request, card)
      return
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error
      }

      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
}

/**
 * Creates the fixture card, or resets an existing row.
 *
 * The retry loop that used to wrap this (twenty attempts, one second apart) only absorbed server warm-up;
 * `globalSetup` now guarantees the API is answering before any spec runs, so a failure here is a real one.
 */
async function createOrResetFixtureCard(
  request: APIRequestContext,
  card: FixtureCardDefinition,
): Promise<void> {
  const response = await request.post(`${API_BASE_URL}/api/card/catalog`, {
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
      // Neither key is sent when it would be empty: the validator rejects an *empty* `conditions` array
      // ("at least one entry when provided"), and an absent list is how the admin client expresses "none".
      // Sending `[]` here is what made the create answer 400 instead of 201/409.
      ...(card.effects ? { effects: card.effects } : {}),
    },
  })

  if (response.ok()) {
    return
  }

  // The body carries the validation message, which is the difference between "the row already exists" and
  // "this fixture is malformed" - without it a 400 here just looks like a broken suite.
  const failureBody = await response.text()

  expect(response.status(), `creating fixture card ${card.cardId}: ${failureBody}`).toBe(409)

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
        ...(card.effects ? { effects: card.effects } : {}),
      },
    },
  )

  expect(patch.ok(), `resetting fixture card ${card.cardId}`).toBeTruthy()
}

/**
 * Ledger of the decks the fixture specs mint, so suite-level cleanup can delete exactly those and nothing else.
 *
 * Lives at the repo root rather than under `test-results/`: Playwright wipes its output directory before global
 * setup runs, which is precisely when the startup sweep needs the list a killed run left behind.
 */
const FIXTURE_DECK_LEDGER_PATH = resolve(process.cwd(), '.e2e-fixture-decks.jsonl')

function recordFixtureDeck(deckId: string): void {
  // One short append per deck; `O_APPEND` keeps the lines intact even when several workers mint decks at once.
  appendFileSync(FIXTURE_DECK_LEDGER_PATH, `${deckId}\n`, 'utf8')
}

function readFixtureDeckLedger(): string[] {
  if (!existsSync(FIXTURE_DECK_LEDGER_PATH)) {
    return []
  }

  return [
    ...new Set(
      readFileSync(FIXTURE_DECK_LEDGER_PATH, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    ),
  ]
}

function writeFixtureDeckLedger(deckIds: string[]): void {
  if (deckIds.length === 0) {
    rmSync(FIXTURE_DECK_LEDGER_PATH, { force: true })
    return
  }

  writeFileSync(FIXTURE_DECK_LEDGER_PATH, `${deckIds.join('\n')}\n`, 'utf8')
}

/**
 * Builds a public deck from the given `"<quantity>x <cardId>"` lines and returns its id, so a spec can use a deck
 * composition the seed manifest does not (and must not) contain.
 *
 * The id is recorded in the fixture ledger, because the deck outlives the spec that made it: global teardown
 * deletes it after every worker exits, which is what keeps fabricated decks out of the database.
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

  // The endpoint answers with a plain-text body (`Created` with a string payload goes through ASP.NET's
  // StringOutputFormatter), so this is not JSON and `response.json()` throws on it. Quotes are stripped
  // defensively in case that formatter ever changes to the JSON one.
  const rawDeckId = (await response.text()).trim()
  const deckId = rawDeckId.replace(/^"|"$/g, '')

  expect(deckId.length, `the deck endpoint should return the id it created, got "${rawDeckId}"`).toBeGreaterThan(0)

  recordFixtureDeck(deckId)

  return deckId
}

/**
 * Deletes every deck the fixture ledger lists, leaving only the seeded decks a fresh checkout starts with.
 *
 * Runs in the same suite-level hooks as {@link reapFixtureCards} - after all workers exit, and once more at
 * startup to catch a run that was killed before teardown. Only decks this suite created are touched: the ledger
 * is the authority, so a developer deck that happens to live in the same database is never deleted.
 *
 * Decks still referenced by a game instance answer 409 and stay in the ledger, so a later run retries them.
 */
export async function reapFixtureDecks(request: APIRequestContext): Promise<string[]> {
    const failures: string[] = []
    const stillPending: string[] = []

    for (const deckId of readFixtureDeckLedger()) {
      try {
        const response = await request.delete(`${API_BASE_URL}/api/deck/${encodeURIComponent(deckId)}`, {
          headers: adminHeaders(),
        })

      if (!response.ok() && response.status() !== 404) {
        const body = await response.text()
        failures.push(`${deckId}: HTTP ${response.status()} ${body}`.trim())
        stillPending.push(deckId)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${deckId}: ${message}`)
      stillPending.push(deckId)
    }
  }

  writeFixtureDeckLedger(stillPending)

  return failures
}

/**
 * Deletes every fixture card the suite knows about, leaving the e2e catalogue as a fresh checkout starts it.
 *
 * This is the suite-scoped counterpart to {@link deleteFixtureCards}: it runs once in Playwright's global
 * teardown, after every worker has exited, so it cannot delete a card from under a spec the way a per-file
 * `afterAll` can (`--repeat-each` with more than one worker). `force=true` is what makes it unconditional - it
 * also drops the `deck_cards` lines that reference the card, so the restricting FK never blocks the delete.
 *
 * Unlike `deleteFixtureCards` this reports failures instead of swallowing them: the caller is the whole run's
 * last chance to keep a fabricated card out of the database, and a silently skipped delete is exactly the bug
 * this helper exists to prevent. A 404 counts as success (the card was never minted, or is already gone).
 */
export async function reapFixtureCards(request: APIRequestContext): Promise<string[]> {
  const failures: string[] = []

  for (const cardId of Object.values(FIXTURE_CARD_IDS)) {
    try {
      const response = await request.delete(
        `${API_BASE_URL}/api/card/catalog/${encodeURIComponent(cardId)}?force=true`,
        { headers: adminHeaders() },
      )

      if (!response.ok() && response.status() !== 404) {
        const body = await response.text()
        failures.push(`${cardId}: HTTP ${response.status()} ${body}`.trim())
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failures.push(`${cardId}: ${message}`)
    }
  }

  return failures
}

/**
 * Removes the fixture cards again, taking them out of any deck that still lists them.
 *
 * Best effort: a failure here leaves two fabricated cards in the throwaway e2e database, which is untidy but not
 * a broken run, and the next run reuses them. Suite-level cleanup does not depend on this: see
 * {@link reapFixtureCards}, which runs from global teardown whether or not a spec cleaned up after itself.
 */
export async function deleteFixtureCards(
  request: APIRequestContext,
  cardIds: string[] = Object.values(FIXTURE_CARD_IDS),
): Promise<void> {
  for (const cardId of cardIds) {
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
