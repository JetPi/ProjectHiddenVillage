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
const CHAKRA_TYPE = 'chakra'
const SUMMON_TYPE = 'summon'

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

  const prohibitedCards = knownCards.filter((card) => isProhibitedType(card.metadata, ruleset))
  if (prohibitedCards.length > 0) {
    violations.push({
      code: 'unsupportedCardType',
      messageKey: 'deckRules.validation.unsupportedCardType',
      params: { cardIds: prohibitedCards.map((card) => card.cardId).join(', ') },
    })
  }

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

  violations.push(...collectRestrictionViolations(leaders, ruleset))
  violations.push(...collectRestrictionViolations(nonLeaders, ruleset))

  if (ruleset.requireLeaderColorMatch && leaders.length === 1) {
    const leaderColor = leaders[0].metadata.color
    const mismatchedCards = nonLeaders.filter(
      (card) => card.metadata.color.trim().toLowerCase() !== leaderColor.trim().toLowerCase(),
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

function collectRestrictionViolations(
  cards: readonly (IEvaluatableDeckCard & { metadata: IDeckCardMetadata })[],
  ruleset: IDeckRuleset,
): IDeckRuleViolation[] {
  const violations: IDeckRuleViolation[] = []
  const restrictionsByCardId = new Map(
    ruleset.cardRestrictions.map((restriction) => [
      normalizeDeckCardId(restriction.cardId),
      restriction.maxCopies,
    ]),
  )

  for (const card of cards) {
    const restrictedMax = restrictionsByCardId.get(normalizeDeckCardId(card.cardId))

    if (restrictedMax === 0) {
      violations.push({
        code: 'bannedCard',
        messageKey: 'deckRules.validation.bannedCard',
        params: { cardId: card.cardId },
      })
      continue
    }

    const effectiveMax = restrictedMax === undefined
      ? ruleset.maxCopiesPerNonLeaderCard
      : Math.min(ruleset.maxCopiesPerNonLeaderCard, restrictedMax)

    if (card.quantity <= effectiveMax) {
      continue
    }

    if (restrictedMax !== undefined && restrictedMax < ruleset.maxCopiesPerNonLeaderCard) {
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

function isProhibitedType(metadata: IDeckCardMetadata, ruleset: IDeckRuleset): boolean {
  const type = normalizeType(metadata.type)

  if (type === CHAKRA_TYPE) {
    return !ruleset.allowChakraCards
  }

  if (type === SUMMON_TYPE) {
    return !ruleset.allowSummonCards
  }

  return false
}

function normalizeType(type: string): string {
  return type.trim().toLowerCase()
}
