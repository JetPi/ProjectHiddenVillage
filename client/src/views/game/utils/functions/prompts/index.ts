import type {
  IGamePromptCandidateCard,
  IPromptPresentation,
  IPromptPresentationOption,
  IPromptPresentationSource,
} from '@/views/game/types'

const OVERLAY_PROMPT_TYPES = new Set<string>(['ChooseStartingPlayer', 'Mulligan', 'Effect'])

const PROMPT_TITLES: Record<string, string> = {
  ChooseStartingPlayer: 'Choose Who Starts',
  Mulligan: 'Mulligan',
  Effect: 'Choose a Card',
}

const PROMPT_SUBTITLES: Record<string, string> = {
  ChooseStartingPlayer: 'Decide whether you or your opponent takes the first turn.',
  Mulligan: 'Choose whether to redraw your opening hand.',
  Effect: 'Choose one of the highlighted cards.',
}

/**
 * Copy buckets for effect selection prompts, keyed by the server's EffectSelectionPromptKind. The server only
 * publishes the stable bucket, so new wording (or a new bucket) never needs a server change.
 */
const EFFECT_SELECTION_PROMPT_COPY: Record<string, { title: string; subtitle: string }> = {
  PlaceOnDeckTop: {
    title: 'Choose a card to place on deck top',
    subtitle: 'Choose a card from your hand to place on top of your deck.',
  },
  PlaceOnDeckBottom: {
    title: 'Choose a card to place on deck bottom',
    subtitle: 'Choose a card from your hand to place on the bottom of your deck.',
  },
  DiscardFromHand: {
    title: 'Discard a Card',
    subtitle: 'Choose a card from your hand to discard.',
  },
  ReturnToHand: {
    title: 'Return a Card to Hand',
    subtitle: "Choose a card to return to its owner's hand.",
  },
  SearchDeck: {
    title: 'Search Your Deck',
    subtitle: 'Choose a card from your deck.',
  },
}

const OPTION_LABELS: Record<string, string> = {
  goFirst: 'Go First',
  goSecond: 'Go Second',
  mulligan: 'Take Mulligan',
  noMulligan: 'Keep Hand',
}

function toTitleCaseWords(rawValue: string): string {
  return rawValue
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ')
}

function toReadableOptionLabel(optionValue: string): string {
  return OPTION_LABELS[optionValue] ?? toTitleCaseWords(optionValue)
}

/**
 * Zones whose cards are rendered on the board, so an effect selection there is answered by clicking the card
 * itself (the hover options become a "Select" button) rather than by the card-list overlay. Zones that are not
 * drawn as selectable cards (a search's deck) keep the overlay.
 */
const BOARD_SELECTION_ZONES = new Set<string>(['Hand', 'CharacterField', 'SupportZone'])

function isBoardSelectionPrompt(pendingPrompt: IPromptPresentationSource): boolean {
  return pendingPrompt?.type === 'Effect' && BOARD_SELECTION_ZONES.has(pendingPrompt.candidateZone ?? '')
}

function toPromptOption(optionValue: string, promptType: string): IPromptPresentationOption {
  return {
    value: optionValue,
    // Effect selections carry card instance ids, which have no readable form - the overlay renders the actual
    // candidate cards instead.
    label: promptType === 'Effect' ? optionValue : toReadableOptionLabel(optionValue),
  }
}

function toPromptPresentation(pendingPrompt: IPromptPresentationSource): IPromptPresentation | null {
  if (!pendingPrompt) {
    return null
  }

  const effectSelectionCopy =
    pendingPrompt.type === 'Effect'
      ? EFFECT_SELECTION_PROMPT_COPY[pendingPrompt.selectionPromptKind ?? '']
      : undefined

  const title =
    effectSelectionCopy?.title ?? PROMPT_TITLES[pendingPrompt.type] ?? toTitleCaseWords(pendingPrompt.type)
  const subtitle =
    effectSelectionCopy?.subtitle
    ?? PROMPT_SUBTITLES[pendingPrompt.type]
    ?? 'Choose one of the available options.'

  return {
    promptType: pendingPrompt.type,
    title,
    subtitle,
    isAwaitingRequestingPlayer: pendingPrompt.isAwaitingRequestingPlayer,
    renderAsOverlay: OVERLAY_PROMPT_TYPES.has(pendingPrompt.type) && !isBoardSelectionPrompt(pendingPrompt),
    options: pendingPrompt.options.map((option) => toPromptOption(option, pendingPrompt.type)),
    selectionPromptKind: pendingPrompt.selectionPromptKind ?? null,
    candidateZone: pendingPrompt.candidateZone ?? null,
  }
}

type IPromptCandidateCatalogCard = {
  id: string
  displayName: string
  image: string
  imageVersion?: number | null
}

type IPromptCandidateInstanceCard = {
  instanceId: string
  cardDefinitionId: string
  displayName?: string
}

/**
 * Resolves the cards an effect selection prompt offers, from whichever collection the server named in
 * `CandidateZone`: the player's hand for "place 1 card from your hand on top of your deck", their deck for a
 * search. The prompt only carries card instance ids, so names and art come from the catalog.
 */
function buildPromptCandidateCards({
  prompt,
  handCards,
  deckCards,
  catalogCards,
}: {
  prompt: IPromptPresentation | null
  handCards: readonly IPromptCandidateInstanceCard[]
  deckCards: readonly IPromptCandidateInstanceCard[]
  catalogCards: readonly IPromptCandidateCatalogCard[]
}): IGamePromptCandidateCard[] {
  if (!prompt || prompt.promptType !== 'Effect') {
    return []
  }

  const sourceCards =
    prompt.candidateZone === 'Hand'
      ? handCards
      : prompt.candidateZone === 'Deck'
        ? deckCards
        : []

  if (sourceCards.length === 0) {
    return []
  }

  const optionInstanceIds = new Set(prompt.options.map((option) => option.value))
  const catalogById = new Map(catalogCards.map((card) => [card.id, card]))

  return sourceCards
    .filter((card) => optionInstanceIds.has(card.instanceId))
    .map((card) => {
      const catalogCard = catalogById.get(card.cardDefinitionId) ?? null

      return {
        instanceId: card.instanceId,
        displayName: card.displayName ?? catalogCard?.displayName ?? card.cardDefinitionId,
        card: catalogCard,
      }
    })
}

export {
  buildPromptCandidateCards,
  toPromptPresentation,
  toReadableOptionLabel,
}
