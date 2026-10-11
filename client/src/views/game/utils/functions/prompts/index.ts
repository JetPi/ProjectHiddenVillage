import i18n, { translateKey } from '@/i18n'
import type {
  IGamePromptCandidateCard,
  IPromptPresentation,
  IPromptPresentationOption,
  IPromptPresentationSource,
} from '@/views/game/types'

const OVERLAY_PROMPT_TYPES = new Set<string>(['ChooseStartingPlayer', 'Mulligan', 'Effect'])

/** Copy lives in en.json; these maps only hold the keys. */
const tr = (key: string, options?: Record<string, unknown>): string =>
  translateKey(i18n.t, key, options)

const PROMPT_TITLE_KEYS: Record<string, string> = {
  ChooseStartingPlayer: 'game.prompt.title.chooseStartingPlayer',
  Mulligan: 'game.prompt.title.mulligan',
  Effect: 'game.prompt.title.effect',
}

const PROMPT_SUBTITLE_KEYS: Record<string, string> = {
  ChooseStartingPlayer: 'game.prompt.subtitle.chooseStartingPlayer',
  Mulligan: 'game.prompt.subtitle.mulligan',
  Effect: 'game.prompt.subtitle.effect',
}

/**
 * Copy buckets for effect selection prompts, keyed by the server's EffectSelectionPromptKind. The server only
 * publishes the stable bucket, so new wording (or a new bucket) never needs a server change.
 */
const EFFECT_SELECTION_COPY_KEYS: Record<string, { title: string; subtitle: string }> = {
  PlaceOnDeckTop: {
    title: 'game.prompt.effectCopy.placeOnDeckTop.title',
    subtitle: 'game.prompt.effectCopy.placeOnDeckTop.subtitle',
  },
  PlaceOnDeckBottom: {
    title: 'game.prompt.effectCopy.placeOnDeckBottom.title',
    subtitle: 'game.prompt.effectCopy.placeOnDeckBottom.subtitle',
  },
  DiscardFromHand: {
    title: 'game.prompt.effectCopy.discardFromHand.title',
    subtitle: 'game.prompt.effectCopy.discardFromHand.subtitle',
  },
  ReturnToHand: {
    title: 'game.prompt.effectCopy.returnToHand.title',
    subtitle: 'game.prompt.effectCopy.returnToHand.subtitle',
  },
  SearchDeck: {
    title: 'game.prompt.effectCopy.searchDeck.title',
    subtitle: 'game.prompt.effectCopy.searchDeck.subtitle',
  },
  // "Summon 1 [Naruto Uzumaki] Character from your trash" (an [On Summon] chain): the pool only exists once the
  // chain reaches this step, so the server asks for the pick instead of taking it up front.
  SummonFromZone: {
    title: 'game.prompt.effectCopy.summonFromZone.title',
    subtitle: 'game.prompt.effectCopy.summonFromZone.subtitle',
  },
  // "Destroy 1 Character" (an [On Summon] chain): the picked card is the one the effect removes. A field
  // pick is answered by the card's own Select button, so this bucket only titles the picker if the effect
  // ever offers a zone the board does not draw as cards.
  DestroyFromZone: {
    title: 'game.prompt.effectCopy.destroyFromZone.title',
    subtitle: 'game.prompt.effectCopy.destroyFromZone.subtitle',
  },
  // "Freeze 1 Leader or Character" (N-013): the picked card cannot attack during the opponent's next turn.
  // Both zones are drawn on the board, so the pick is answered with the card's own Select button - the leader
  // card included (it is listed in the board-answerable zones).
  FreezeFromZone: {
    title: 'game.prompt.effectCopy.freezeFromZone.title',
    subtitle: 'game.prompt.effectCopy.freezeFromZone.subtitle',
  },
  // A "Reveal First" chain suspends so the player can see the card it turned over; the client acknowledges it
  // on its own, so the copy is only shown if the presentation ever needs a caption.
  RevealPresentation: {
    title: 'game.prompt.effectCopy.revealPresentation.title',
    subtitle: 'game.prompt.effectCopy.revealPresentation.subtitle',
  },
}

const OPTION_LABEL_KEYS: Record<string, string> = {
  goFirst: 'game.prompt.option.goFirst',
  goSecond: 'game.prompt.option.goSecond',
  mulligan: 'game.prompt.option.mulligan',
  noMulligan: 'game.prompt.option.noMulligan',
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
  const labelKey = OPTION_LABEL_KEYS[optionValue]
  return labelKey ? tr(labelKey) : toTitleCaseWords(optionValue)
}

/**
 * Zones whose cards are rendered on the board, so an effect selection there is answered by clicking the card
 * itself (the hover options become a "Select" button) rather than by the card-list overlay. The leader is one
 * of them (N-013's freeze may pick it); zones that are not drawn as selectable cards (a search's deck) keep
 * the overlay.
 */
const BOARD_SELECTION_ZONES = new Set<string>(['Hand', 'CharacterField', 'SupportZone', 'Leader'])

/**
 * Presentation prompts are not questions: a "Reveal First" chain suspends so the player can look at the card it
 * turned over, and the client acknowledges it on its own (see the reveal presentation ack effect). Never render
 * a picker - the only option IS the acknowledgement.
 */
const PRESENTATION_PROMPT_KINDS = new Set<string>(['RevealPresentation'])

function isPresentationPrompt(pendingPrompt: IPromptPresentationSource): boolean {
  return PRESENTATION_PROMPT_KINDS.has(pendingPrompt?.selectionPromptKind ?? '')
}

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

  const effectSelectionCopyKeys =
    pendingPrompt.type === 'Effect'
      ? EFFECT_SELECTION_COPY_KEYS[pendingPrompt.selectionPromptKind ?? '']
      : undefined

  const titleKey = effectSelectionCopyKeys?.title ?? PROMPT_TITLE_KEYS[pendingPrompt.type]
  const title = titleKey ? tr(titleKey) : toTitleCaseWords(pendingPrompt.type)

  const subtitleKey = effectSelectionCopyKeys?.subtitle ?? PROMPT_SUBTITLE_KEYS[pendingPrompt.type]
  const subtitle = subtitleKey ? tr(subtitleKey) : tr('game.prompt.subtitle.default')

  return {
    promptType: pendingPrompt.type,
    title,
    subtitle,
    isAwaitingRequestingPlayer: pendingPrompt.isAwaitingRequestingPlayer,
    renderAsOverlay:
      OVERLAY_PROMPT_TYPES.has(pendingPrompt.type)
      && !isBoardSelectionPrompt(pendingPrompt)
      && !isPresentationPrompt(pendingPrompt),
    options: pendingPrompt.options.map((option) => toPromptOption(option, pendingPrompt.type)),
    selectionPromptKind: pendingPrompt.selectionPromptKind ?? null,
    candidateZone: pendingPrompt.candidateZone ?? null,
    candidatePlayerId: pendingPrompt.candidatePlayerId ?? null,
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
 * The zones a prompt can draw candidates from, in the order they are searched when several rules feed the same
 * prompt. Callers pass the raw player collections; the zone the server named in `CandidateZone` is moved to the
 * front (it is the server's own hint), the rest stay in this order as the fallback pool.
 */
type IPromptCandidatePlayer = {
  playerId: string
  /** The leader is a single board card rather than a collection; the pool flattens it like one. */
  leader?: IPromptCandidateInstanceCard | null
  hand: readonly IPromptCandidateInstanceCard[]
  deck: readonly IPromptCandidateInstanceCard[]
  trash: readonly IPromptCandidateInstanceCard[]
  exileZone: readonly IPromptCandidateInstanceCard[]
}

/** The candidate collections of one player, in the order they are searched as the fallback pool. */
function resolvePromptCandidateCollections(
  player: IPromptCandidatePlayer,
): readonly (readonly IPromptCandidateInstanceCard[])[] {
  return [
    player.leader ? [player.leader] : [],
    player.hand,
    player.deck,
    player.trash,
    player.exileZone,
  ]
}

const PROMPT_CANDIDATE_ZONE_INDEX: Record<string, number> = {
  Leader: 0,
  Hand: 1,
  Deck: 2,
  Trash: 3,
  ExileZone: 4,
}

/**
 * The candidate pool a prompt draws from, as one list: the collection the server named in `CandidateZone` first,
 * then that player's remaining collections. Zones the board does not render as a pickable set (deck, trash,
 * exile) are read straight from the player payload, so a "summon 1 Character from your trash" prompt has real
 * card faces to click.
 *
 * The fallback is what keeps a multi-rule prompt honest: "summon 1 [Naruto Uzumaki] from your trash **or** your
 * deck" resolves candidates out of both zones at once while `CandidateZone` can only name one of them, and the
 * prompt's own `options` are the authoritative pick list (see `buildPromptCandidateCards`).
 */
function resolvePromptCandidatePool({
  prompt,
  players,
  fallbackPlayerId,
}: {
  prompt: IPromptPresentation
  players: readonly IPromptCandidatePlayer[]
  fallbackPlayerId: string | null
}): readonly IPromptCandidateInstanceCard[] {
  const ownerPlayerId = prompt.candidatePlayerId ?? fallbackPlayerId
  const player = players.find((candidate) => candidate.playerId === ownerPlayerId)

  if (!player) {
    return []
  }

  const collections = [...resolvePromptCandidateCollections(player)]
  const namedIndex = prompt.candidateZone ? PROMPT_CANDIDATE_ZONE_INDEX[prompt.candidateZone] : undefined

  if (namedIndex === undefined) {
    return collections.flat()
  }

  // The collection the server named in `CandidateZone` first, then that player's remaining collections.
  const [namedCollection] = collections.splice(namedIndex, 1)

  return [namedCollection, ...collections].flat()
}

/**
 * Resolves the cards an effect selection prompt offers: the prompt carries card instance ids only, so each one is
 * looked up in the candidate pool and its name/art come from the catalog. The tiles follow the prompt's own
 * option order, which is the server's candidate order.
 */
function buildPromptCandidateCards({
  prompt,
  players,
  requestingPlayerId,
  catalogCards,
}: {
  prompt: IPromptPresentation | null
  players: readonly IPromptCandidatePlayer[]
  requestingPlayerId?: string | null
  catalogCards: readonly IPromptCandidateCatalogCard[]
}): IGamePromptCandidateCard[] {
  if (!prompt || prompt.promptType !== 'Effect') {
    return []
  }

  const candidatePool = resolvePromptCandidatePool({
    prompt,
    players,
    fallbackPlayerId: requestingPlayerId ?? null,
  })

  if (candidatePool.length === 0) {
    return []
  }

  const cardByInstanceId = new Map(
    candidatePool.map((card) => [card.instanceId.trim().toLowerCase(), card]),
  )
  const catalogById = new Map(catalogCards.map((card) => [card.id, card]))
  const seenInstanceIds = new Set<string>()
  const resolvedCards: IGamePromptCandidateCard[] = []

  for (const option of prompt.options) {
    const normalizedInstanceId = option.value.trim().toLowerCase()

    if (!normalizedInstanceId || seenInstanceIds.has(normalizedInstanceId)) {
      continue
    }

    const card = cardByInstanceId.get(normalizedInstanceId)

    if (!card) {
      continue
    }

    seenInstanceIds.add(normalizedInstanceId)
    const catalogCard = catalogById.get(card.cardDefinitionId) ?? null

    resolvedCards.push({
      instanceId: card.instanceId,
      displayName: card.displayName ?? catalogCard?.displayName ?? card.cardDefinitionId,
      card: catalogCard,
    })
  }

  return resolvedCards
}

export {
  buildPromptCandidateCards,
  toPromptPresentation,
  toReadableOptionLabel,
}
