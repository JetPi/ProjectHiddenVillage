import i18n, { translateKey } from '@/i18n'
import type {
  IGamePromptCandidateCard,
  IPromptPresentation,
  IPromptPresentationOption,
  IPromptPresentationSource,
} from '@/views/game/types'

const OVERLAY_PROMPT_TYPES = new Set<string>(['ChooseStartingPlayer', 'Mulligan', 'Effect'])

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
  SummonFromZone: {
    title: 'game.prompt.effectCopy.summonFromZone.title',
    subtitle: 'game.prompt.effectCopy.summonFromZone.subtitle',
  },
  DestroyFromZone: {
    title: 'game.prompt.effectCopy.destroyFromZone.title',
    subtitle: 'game.prompt.effectCopy.destroyFromZone.subtitle',
  },
  FreezeFromZone: {
    title: 'game.prompt.effectCopy.freezeFromZone.title',
    subtitle: 'game.prompt.effectCopy.freezeFromZone.subtitle',
  },
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

const BOARD_SELECTION_ZONES = new Set<string>(['Hand', 'CharacterField', 'SupportZone', 'Leader'])

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

type IPromptCandidatePlayer = {
  playerId: string
  leader?: IPromptCandidateInstanceCard | null
  hand: readonly IPromptCandidateInstanceCard[]
  deck: readonly IPromptCandidateInstanceCard[]
  trash: readonly IPromptCandidateInstanceCard[]
  exileZone: readonly IPromptCandidateInstanceCard[]
}

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

  const [namedCollection] = collections.splice(namedIndex, 1)

  return [namedCollection, ...collections].flat()
}

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
