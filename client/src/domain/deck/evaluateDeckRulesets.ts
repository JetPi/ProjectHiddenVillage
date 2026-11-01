import type { IDeckCardInput } from '@/types/deck'
import type { IDeckRuleset } from '@/types/deckRuleset'
import { normalizeDeckCardId } from './parseDeckList'
import type {
  IDeckCardMetadata,
  IDeckRuleViolation,
  IDeckRulesetEvaluation,
  IDeckRulesetValidation,
} from './types'

type IEvaluatableDeckCard = {
  cardId: string
  quantity: number
  metadata: IDeckCardMetadata | null
}

const LEADER_TYPE = 'leader'

export type IEvaluateDeckRulesetsOptions = {
  cards: readonly IDeckCardInput[]
  cardsById: ReadonlyMap<string, IDeckCardMetadata>
  rulesets: readonly IDeckRuleset[]
}

export function evaluateDeckRulesets({
  cards,
  cardsById,
  rulesets,
}: IEvaluateDeckRulesetsOptions): IDeckRulesetValidation {
  const normalizedCards = normalizeCards(cards, cardsById)
  const evaluations = rulesets.map((ruleset) => evaluateRulesetFromNormalized(normalizedCards, ruleset))

  return {
    isLegalInAnyRuleset: evaluations.some((evaluation) => evaluation.isValid),
    evaluations,
  }
}

export function evaluateRuleset(
  cards: readonly IDeckCardInput[],
  cardsById: ReadonlyMap<string, IDeckCardMetadata>,
  ruleset: IDeckRuleset,
): IDeckRulesetEvaluation {
  return evaluateRulesetFromNormalized(normalizeCards(cards, cardsById), ruleset)
}

function evaluateRulesetFromNormalized(
  cards: readonly IEvaluatableDeckCard[],
  ruleset: IDeckRuleset,
): IDeckRulesetEvaluation {
  const violations: IDeckRuleViolation[] = []

  const unknownCards = cards.filter((card) => card.metadata === null)
  if (unknownCards.length > 0) {
    violations.push({
      code: 'unknownCards',
      messageKey: 'deckRules.validation.unknownCards',
      params: { cardIds: unknownCards.map((card) => card.cardId).join(', ') },
    })
  }

  const knownCards = cards.filter(
    (card): card is IEvaluatableDeckCard & { metadata: IDeckCardMetadata } => card.metadata !== null,
  )

  const leaders = knownCards.filter((card) => isLeader(card.metadata))
  const nonLeaders = knownCards.filter((card) => !isLeader(card.metadata))
  const leaderCopies = leaders.reduce((total, card) => total + card.quantity, 0)
  const nonLeaderCopies = nonLeaders.reduce((total, card) => total + card.quantity, 0)

  if (leaders.length !== ruleset.leaderCount) {
    violations.push({
      code: 'leaderCount',
      messageKey: 'deckRules.validation.leaderCount',
      params: { expected: ruleset.leaderCount, actual: leaders.length },
    })
  }

  for (const leader of leaders.filter((card) => card.quantity !== 1)) {
    violations.push({
      code: 'leaderCopies',
      messageKey: 'deckRules.validation.leaderCopies',
      params: { cardId: leader.cardId, quantity: leader.quantity },
    })
  }

  if (nonLeaderCopies !== ruleset.nonLeaderCardCount) {
    violations.push({
      code: 'deckSize',
      messageKey: 'deckRules.validation.deckSize',
      params: { expected: ruleset.nonLeaderCardCount, actual: nonLeaderCopies },
    })
  }

  const cardRules = buildRuleIndex(ruleset, 'Card')
  const setRules = buildRuleIndex(ruleset, 'Set')

  violations.push(...collectRestrictionViolations(leaders, ruleset, cardRules, setRules))
  violations.push(...collectRestrictionViolations(nonLeaders, ruleset, cardRules, setRules))

  if (ruleset.requireLeaderColorMatch && leaders.length === 1) {
    const leaderColor = leaders[0].metadata.color
    // Cards with no colour of their own - Chakra and Summon cards - cannot match a leader's colour and are
    // governed by the type flags instead, exactly as the server evaluates them.
    const mismatchedCards = nonLeaders.filter(
      (card) =>
        hasColor(card.metadata.color)
        && card.metadata.color.trim().toLowerCase() !== leaderColor.trim().toLowerCase(),
    )

    if (mismatchedCards.length > 0) {
      violations.push({
        code: 'colorMismatch',
        messageKey: 'deckRules.validation.colorMismatch',
        params: {
          color: leaderColor,
          cardIds: mismatchedCards.map((card) => card.cardId).join(', '),
        },
      })
    }
  }

  return {
    ruleset,
    isValid: violations.length === 0,
    violations,
    leaderCopies,
    nonLeaderCopies,
  }
}

/**
 * The set a card belongs to: the text before the first dash, upper-cased. A segment comparison rather than a
 * prefix test, because `S` is a prefix of `SAMPLE` and a set rule must never swallow a different set.
 */
export function getDeckCardSetCode(cardId: string): string {
  const normalizedCardId = cardId.trim().toUpperCase()
  const separatorIndex = normalizedCardId.indexOf('-')

  return separatorIndex > 0 ? normalizedCardId.slice(0, separatorIndex) : normalizedCardId
}

function buildRuleIndex(
  ruleset: IDeckRuleset,
  matchType: 'Card' | 'Set',
): Map<string, number> {
  const index = new Map<string, number>()

  for (const restriction of ruleset.cardRestrictions) {
    if (restriction.matchType !== matchType) {
      continue
    }

    const code = restriction.code.trim().toUpperCase()
    if (!code) {
      continue
    }

    index.set(code, restriction.maxCopies)
  }

  return index
}

function collectRestrictionViolations(
  cards: readonly (IEvaluatableDeckCard & { metadata: IDeckCardMetadata })[],
  ruleset: IDeckRuleset,
  cardRules: ReadonlyMap<string, number>,
  setRules: ReadonlyMap<string, number>,
): IDeckRuleViolation[] {
  const violations: IDeckRuleViolation[] = []

  for (const card of cards) {
    const cardCode = card.cardId.trim().toUpperCase()
    // A rule naming the whole code always beats a rule naming its set.
    const restrictedMax = cardRules.get(cardCode) ?? setRules.get(getDeckCardSetCode(cardCode))

    if (restrictedMax === undefined) {
      if (ruleset.cardPoolMode === 'AllowList') {
        violations.push({
          code: 'notInCardPool',
          messageKey: 'deckRules.validation.notInCardPool',
          params: { cardId: card.cardId },
        })
        continue
      }

      // An open pool still caps copies: a rule is an override, never the only limit.
      if (card.quantity > ruleset.maxCopiesPerNonLeaderCard) {
        violations.push({
          code: 'tooManyCopies',
          messageKey: 'deckRules.validation.tooManyCopies',
          params: {
            cardId: card.cardId,
            max: ruleset.maxCopiesPerNonLeaderCard,
            quantity: card.quantity,
          },
        })
      }

      continue
    }

    if (restrictedMax <= 0) {
      violations.push({
        code: 'bannedCard',
        messageKey: 'deckRules.validation.bannedCard',
        params: { cardId: card.cardId },
      })
      continue
    }

    const effectiveMax = Math.min(ruleset.maxCopiesPerNonLeaderCard, restrictedMax)

    if (card.quantity <= effectiveMax) {
      continue
    }

    if (restrictedMax < ruleset.maxCopiesPerNonLeaderCard) {
      violations.push({
        code: 'limitedCard',
        messageKey: 'deckRules.validation.limitedCard',
        params: { cardId: card.cardId, max: effectiveMax, quantity: card.quantity },
      })
      continue
    }

    violations.push({
      code: 'tooManyCopies',
      messageKey: 'deckRules.validation.tooManyCopies',
      params: { cardId: card.cardId, max: effectiveMax, quantity: card.quantity },
    })
  }

  return violations
}

function hasColor(color: string): boolean {
  return color.trim().toLowerCase() !== 'n/a'
}

function normalizeCards(
  cards: readonly IDeckCardInput[],
  cardsById: ReadonlyMap<string, IDeckCardMetadata>,
): IEvaluatableDeckCard[] {
  const quantitiesByCardId = new Map<string, number>()

  for (const card of cards) {
    if (!card.cardId.trim() || card.quantity <= 0) {
      continue
    }

    const cardId = card.cardId.trim().toUpperCase()
    quantitiesByCardId.set(cardId, (quantitiesByCardId.get(cardId) ?? 0) + card.quantity)
  }

  return [...quantitiesByCardId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cardId, quantity]) => ({
      cardId,
      quantity,
      metadata: cardsById.get(normalizeDeckCardId(cardId)) ?? null,
    }))
}

function isLeader(metadata: IDeckCardMetadata): boolean {
  return normalizeType(metadata.type) === LEADER_TYPE
}

function normalizeType(type: string): string {
  return type.trim().toLowerCase()
}
