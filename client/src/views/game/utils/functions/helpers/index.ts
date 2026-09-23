import { PhaseValues } from "@/views/game/components/constants/gamePhaseActionRow"
import type { IGameStateResponse, ISupportChainEntryResponse } from "@/services/api/gameApi"
import type {
  IEffectTargetingState,
  ISummonTargetingState,
  ISupportChainViewActor,
  ISupportChainViewEntry,
  ISupportChainViewNegatedTarget,
} from '@/views/game/types'
import { canConfirmEffectTargetSelection, resolveEffectTargetRequiredCount } from '@/views/game/utils/functions/gameState/canConfirmEffectTargetSelection'
import { canConfirmSummonTargetSelection } from '@/views/game/utils/functions/gameState/canConfirmSummonTargetSelection'

function normalizeId(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/-/g, '')
}

function getPhaseValue(
  gameInstance: IGameStateResponse,
  authUserId?: string,
  pendingSummonTargeting?: ISummonTargetingState | null,
  pendingEffectTargeting?: IEffectTargetingState | null,
): string {
  const tributeSelectionPhaseValue = getTributeSelectionPhaseValue(pendingSummonTargeting)
  if (tributeSelectionPhaseValue !== null) {
    return tributeSelectionPhaseValue
  }

  const effectTargetSelectionPhaseValue = getEffectTargetSelectionPhaseValue(pendingEffectTargeting)
  if (effectTargetSelectionPhaseValue !== null) {
    return effectTargetSelectionPhaseValue
  }

  // An effect selection prompt ("select a card to place on deck top") shows its own message while it waits for
  // this player's answer - the message names what to pick, and the picking itself happens on the cards' Select
  // buttons. Nothing else is added to this line for a prompt: no counts, no confirm chip.
  const promptSelectionPhaseValue = getPromptSelectionPhaseValue(gameInstance)
  if (promptSelectionPhaseValue !== null) {
    return promptSelectionPhaseValue
  }

  const supportResponseWindowPhaseValue = getSupportResponseWindowPhaseValue(gameInstance, authUserId)
  if (supportResponseWindowPhaseValue !== null) {
    return supportResponseWindowPhaseValue
  }

  const normalizedAuthUserId = normalizeId(authUserId)
  const normalizedActivePlayerId = normalizeId(gameInstance.activePlayerId)
  const normalizedPriorityPlayerId = normalizeId(gameInstance.priorityPlayerId)

  const isPlayerInPriority = normalizedAuthUserId.length > 0 && normalizedAuthUserId === normalizedPriorityPlayerId
  const isPlayerTurn = normalizedAuthUserId.length > 0 && normalizedActivePlayerId === normalizedAuthUserId

  const otherPlayer = gameInstance.players.length > 1

  const IsPendingPromptNotFromCurrentPlayer = gameInstance.pendingPrompt && !gameInstance.pendingPrompt.isAwaitingRequestingPlayer
  const pendingPromptType = gameInstance.pendingPrompt?.type.toLowerCase()
  const attackSequenceStage = gameInstance.attackSequenceStage

  if (!otherPlayer) {
    return PhaseValues['w-for-players']
  } else {
    

    if (gameInstance.isAttackSequencePending && gameInstance.attackSequenceStage) {
        switch (attackSequenceStage) {
          case 'AttackDeclaration':
            return isPlayerTurn
              ? PhaseValues['your-attack-declaration']
              : PhaseValues['opponent-attack-declaration']
          case 'EffectDeclaration':
            return PhaseValues['effect-declaration']
          case 'SupportCutIn':
            return isPlayerInPriority ? PhaseValues['your-support-cut-in'] : PhaseValues['opponent-support-cut-in']
          case 'DamageStep':
            return PhaseValues['damage-step']
        }
    }

    if (IsPendingPromptNotFromCurrentPlayer) {
        switch (pendingPromptType) {
          case 'mulligan':
            return PhaseValues['w-for-opponent-to-mulligan']
          case 'choosestartingplayer':
            return PhaseValues['w-for-opponent-to-pick-starter']
          default:
            return PhaseValues['w-for-opponent-to-choose']
        }
    }
  }

  return isPlayerTurn ? PhaseValues['player-turn'] : PhaseValues['opponent-turn']
}

/**
 * Fallback label for the catch-all material, mirroring the server's
 * `TributeRequirementDescription.GenericMaterialLabel`. The server normally declares it explicitly
 * (and flags it with `isGeneric`), so this only backs up an incomplete payload.
 */
/**
 * Names what an effect selection prompt is asking for, keyed by the server's EffectSelectionPromptKind /
 * {@link IPromptPresentation.selectionPromptKind}. Adding a kind means one entry here (plus the prompt copy in
 * `utils/functions/prompts`) - no server change.
 */
function getPromptSelectionPhaseValue(gameInstance: IGameStateResponse): string | null {
  const pendingPrompt = gameInstance.pendingPrompt
  if (!pendingPrompt || promptType(pendingPrompt.type) !== 'effect' || !pendingPrompt.isAwaitingRequestingPlayer) {
    return null
  }

  switch (pendingPrompt.selectionPromptKind) {
    case 'PlaceOnDeckTop':
      return PhaseValues['select-prompt-place-on-deck-top']
    case 'PlaceOnDeckBottom':
      return PhaseValues['select-prompt-place-on-deck-bottom']
    case 'DiscardFromHand':
      return PhaseValues['select-prompt-discard-from-hand']
    case 'ReturnToHand':
      return PhaseValues['select-prompt-return-to-hand']
    case 'SearchDeck':
      return PhaseValues['select-prompt-search-deck']
    default:
      return PhaseValues['select-prompt-generic']
  }
}

function promptType(rawType: string): string {
  return rawType.trim().toLowerCase()
}

const GENERIC_TRIBUTE_MATERIAL_LABEL = 'any'

type ITributeMaterialRequirementGroup = {
  label: string
  isGeneric: boolean
  requiredCount: number
  selectedCount: number
  remainingCount: number
}

type ITributeRequirementSummary = {
  isActive: boolean
  requiredCount: number
  selectedCount: number
  remainingCount: number
  materialSummary: string
  groups: ITributeMaterialRequirementGroup[]
  isSatisfied: boolean
  title: string
}

function resolveTributeMaterialLabelsByCardInstanceId(
  targeting: ISummonTargetingState,
): Map<string, string[]> {
  const labelsByCardInstanceId = new Map<string, string[]>()

  for (const [instanceId, labels] of Object.entries(targeting.requirementLabelsByCardInstanceId ?? {})) {
    const normalizedInstanceId = normalizeId(instanceId)
    if (!normalizedInstanceId) {
      continue
    }

    labelsByCardInstanceId.set(
      normalizedInstanceId,
      (labels ?? []).map((label) => label.trim()).filter((label) => label.length > 0),
    )
  }

  return labelsByCardInstanceId
}

/**
 * Resolves the material groups the SERVER declared for this summon. The server derives them from the
 * effect's tribute material rules, so the sizes are authoritative and the client never has to guess
 * how many cards of each material are consumed.
 */
function resolveServerTributeMaterialGroups(
  targeting: ISummonTargetingState,
): Array<{ label: string; requiredCount: number; isGeneric: boolean }> {
  const materialRequirements = (targeting.materialRequirements ?? [])
    .map((requirement) => ({
      label: requirement.label.trim(),
      requiredCount: requirement.requiredCount,
      isGeneric: requirement.isGeneric === true,
    }))
    .filter((requirement) => requirement.label.length > 0 && requirement.requiredCount > 0)

  if (materialRequirements.length > 0) {
    return materialRequirements
  }

  // Defensive fallback for a payload without server-declared groups: a single generic material sized
  // by the declared target count, so the chip and the phase text still render something sane.
  const fallbackCount = targeting.exactTargetCount
    ?? targeting.minimumTargetCount
    ?? targeting.maximumTargetCount
    ?? 1

  return [{
    label: GENERIC_TRIBUTE_MATERIAL_LABEL,
    requiredCount: Math.max(1, fallbackCount),
    isGeneric: true,
  }]
}

/**
 * Turns the server-declared material groups into progress groups. Only the selection has to be
 * distributed here: a selected card pays for a named material it matches first, then for any generic
 * ("any") material that is still short.
 */
function buildTributeMaterialRequirementGroups(
  targeting: ISummonTargetingState,
): ITributeMaterialRequirementGroup[] {
  const labelsByCardInstanceId = resolveTributeMaterialLabelsByCardInstanceId(targeting)
  const groups: ITributeMaterialRequirementGroup[] = resolveServerTributeMaterialGroups(targeting).map(
    (requirement) => ({
      label: requirement.label,
      isGeneric: requirement.isGeneric,
      requiredCount: requirement.requiredCount,
      selectedCount: 0,
      remainingCount: requirement.requiredCount,
    }),
  )

  for (const selectedTarget of targeting.selectedTargets) {
    const cardLabels = (labelsByCardInstanceId.get(normalizeId(selectedTarget.cardInstanceId)) ?? [])
      .map((label) => label.toLowerCase())
    const matchingGroup = groups.find((group) =>
      !group.isGeneric
      && group.selectedCount < group.requiredCount
      && cardLabels.includes(group.label.toLowerCase()))
      ?? groups.find((group) => group.isGeneric && group.selectedCount < group.requiredCount)

    if (!matchingGroup) {
      continue
    }

    matchingGroup.selectedCount += 1
    matchingGroup.remainingCount = Math.max(0, matchingGroup.requiredCount - matchingGroup.selectedCount)
  }

  return groups
}

function buildTributeMaterialNeedsText(groups: ITributeMaterialRequirementGroup[]): string {
  return groups
    .filter((group) => group.remainingCount > 0)
    .map((group) => `${group.label} x${group.remainingCount}`)
    .join(', ')
}

function getTributeRequirementSummary(
  pendingSummonTargeting: ISummonTargetingState | null | undefined,
): ITributeRequirementSummary {
  if (!pendingSummonTargeting) {
    return {
      isActive: false,
      requiredCount: 0,
      selectedCount: 0,
      remainingCount: 0,
      materialSummary: '',
      groups: [],
      isSatisfied: false,
      title: '',
    }
  }

  const groups = buildTributeMaterialRequirementGroups(pendingSummonTargeting)
  const selectedCount = pendingSummonTargeting.selectedTargets.length
  const requiredCount = groups.reduce((total, group) => total + group.requiredCount, 0)
  const remainingCount = groups.reduce((total, group) => total + group.remainingCount, 0)
  const needsText = buildTributeMaterialNeedsText(groups)
  const isSatisfied = remainingCount === 0 && canConfirmSummonTargetSelection(pendingSummonTargeting)
  const materialSummary = needsText.length > 0 ? needsText : GENERIC_TRIBUTE_MATERIAL_LABEL

  return {
    isActive: true,
    requiredCount,
    selectedCount,
    remainingCount,
    materialSummary,
    groups,
    isSatisfied,
    title: isSatisfied
      ? `All tribute requirements fulfilled · ${selectedCount}/${requiredCount} selected`
      : `Select tribute materials · ${selectedCount}/${requiredCount} selected · still needs ${materialSummary}`,
  }
}

/**
 * Phase text shown while the player is picking tribute materials, e.g.
 * "Selecting tribute materials (needs: (Toad x1, any x1))". The needs list shrinks as materials are
 * selected and switches to the fulfilled text once every requirement group is covered.
 */
function getTributeSelectionPhaseValue(
  pendingSummonTargeting: ISummonTargetingState | null | undefined,
): string | null {
  const summary = getTributeRequirementSummary(pendingSummonTargeting)
  if (!summary.isActive) {
    return null
  }

  if (summary.isSatisfied) {
    return PhaseValues['fulfilled-tribute-requirements']
  }

  return `${PhaseValues['selecting-tribute-materials']} (needs: (${summary.materialSummary}))`
}

/**
 * Phase text shown while the player is picking targets for a range effect, e.g.
 * "Selecting support targets (needs: 1)". The count shrinks as candidates are toggled and switches to
 * the fulfilled text once the selection satisfies the server-declared requirement.
 */
function getEffectTargetSelectionPhaseValue(
  pendingEffectTargeting: IEffectTargetingState | null | undefined,
): string | null {
  if (!pendingEffectTargeting) {
    return null
  }

  if (canConfirmEffectTargetSelection(pendingEffectTargeting)) {
    return PhaseValues['fulfilled-effect-targets']
  }

  const requiredCount = resolveEffectTargetRequiredCount(pendingEffectTargeting)
  const remainingCount = Math.max(0, requiredCount - pendingEffectTargeting.selectedTargets.length)

  return `${PhaseValues['selecting-effect-targets']} (needs: ${remainingCount})`
}

/**
 * Phase text shown while an activated support waits for responses in the MainPhase. The window belongs to
 * whoever holds priority, so each client can tell whether it is being asked to react with a
 * [Support Activated] card (or simply to let the activation resolve by passing).
 */
function getSupportResponseWindowPhaseValue(
  gameInstance: IGameStateResponse,
  authUserId?: string,
): string | null {
  if (gameInstance.isSupportResponseWindowOpen !== true) {
    return null
  }

  const isAuthPlayerPriority = normalizeId(authUserId).length > 0
    && normalizeId(authUserId) === normalizeId(gameInstance.priorityPlayerId)

  return isAuthPlayerPriority
    ? PhaseValues['support-activated-your-response']
    : PhaseValues['support-activated-opponent-response']
}

function getPhaseThemeClasses(gameInstance: IGameStateResponse, phaseValue: string, authUserId?: string): string {
  if (phaseValue === PhaseValues['your-support-cut-in']
    || phaseValue === PhaseValues['support-activated-your-response']) {
    return 'turn-indicator-orange turn-indicator-text-light-theme'
  }

  if (phaseValue === PhaseValues['opponent-support-cut-in']
    || phaseValue === PhaseValues['support-activated-opponent-response']) {
    return 'turn-indicator-blue turn-indicator-text-dark-theme'
  }

  const normalizedAuthUserId = normalizeId(authUserId)
  const normalizedActivePlayerId = normalizeId(gameInstance.activePlayerId)
  const hasBothPlayers = gameInstance.players.length > 1
  const isPlayerTurn = normalizedAuthUserId.length > 0 && normalizedAuthUserId === normalizedActivePlayerId

  if (!hasBothPlayers) {
    return 'turn-indicator-light-gray turn-indicator-text-black'
  }

  return isPlayerTurn
    ? 'turn-indicator-orange turn-indicator-text-light-theme'
    : 'turn-indicator-blue turn-indicator-text-dark-theme'
}

/**
 * The support reaction chain as the board bubble shows it: every queued activation with its order, who
 * activated it, the card it targets (a board card, or another queued activation when it negates it) and
 * which activations a later negate claims. The engine publishes the raw chain on the state
 * (`supportChain`), so the labels here are pure presentation - no client-side chain bookkeeping.
 */
function buildSupportChainView(
  gameInstance: IGameStateResponse,
  authUserId?: string,
): ISupportChainViewEntry[] {
  const chain = gameInstance.supportChain ?? []
  if (chain.length === 0) {
    return []
  }

  const normalizedAuthUserId = normalizeId(authUserId)
  const entriesBySequence = new Map<number, ISupportChainEntryResponse>()
  const sequenceByEntryId = new Map<string, number>()

  for (const entry of chain) {
    entriesBySequence.set(entry.sequence, entry)
    sequenceByEntryId.set(entry.entryId, entry.sequence)
  }

  const resolveActor = (playerId: string): ISupportChainViewActor => {
    const normalizedPlayerId = normalizeId(playerId)
    if (normalizedPlayerId.length === 0 || normalizedAuthUserId.length === 0) {
      return 'unknown'
    }

    return normalizedPlayerId === normalizedAuthUserId ? 'you' : 'opponent'
  }

  const resolvedEntries = [...chain]
    .sort((left, right) => left.sequence - right.sequence)
    .map((entry) => {
      const negatedTargets = entry.targets
        .filter((target) => target.isChainEntry)
        .map((target) => {
          const sequence = target.chainEntryId ? sequenceByEntryId.get(target.chainEntryId) ?? null : null
          const answeredEntry = sequence === null ? null : entriesBySequence.get(sequence) ?? null

          return sequence === null
            ? null
            : {
              sequence,
              displayName: answeredEntry?.sourceCardDisplayName ?? target.displayName,
            }
        })
        .filter((target): target is ISupportChainViewNegatedTarget => target !== null)

      return {
        entryId: entry.entryId,
        sequence: entry.sequence,
        actor: resolveActor(entry.playerId),
        sourceCardInstanceId: entry.sourceCardInstanceId,
        sourceCardDisplayName: entry.sourceCardDisplayName,
        isNegated: entry.isNegated,
        negatedTargets,
        cardTargets: entry.targets
          .filter((target) => !target.isChainEntry)
          .map((target) => ({
            cardInstanceId: target.cardInstanceId,
            displayName: target.displayName,
            ownerPlayerId: target.ownerPlayerId,
            isOwnCard: normalizeId(target.ownerPlayerId) === normalizedAuthUserId,
          })),
        negatedBySequence: null,
        resolvesNext: false,
      } satisfies ISupportChainViewEntry
    })

  const negatedBySequenceByEntrySequence = new Map<number, number>()
  for (const entry of resolvedEntries) {
    for (const target of entry.negatedTargets) {
      negatedBySequenceByEntrySequence.set(target.sequence, entry.sequence)
    }
  }

  // The chain resolves last in, first out: the most recent activation is the one that happens next, unless
  // a later entry has already claimed it with a negate.
  const newestEntry = resolvedEntries[resolvedEntries.length - 1]

  return resolvedEntries.map((entry) => ({
    ...entry,
    negatedBySequence: negatedBySequenceByEntrySequence.get(entry.sequence) ?? null,
    resolvesNext: entry.entryId === newestEntry.entryId,
  }))
}

/**
 * A single support activation opens a reaction window; the bubble is for what follows - a chain where
 * someone actually answered (a support activated inside that window), so a lone activation never pops it.
 */
function shouldShowSupportChainBubble(entries: ISupportChainViewEntry[]): boolean {
  return entries.length >= 2
}

export {
  normalizeId,
  getPhaseValue,
  getPhaseThemeClasses,
  getTributeRequirementSummary,
  getTributeSelectionPhaseValue,
  buildSupportChainView,
  shouldShowSupportChainBubble,
}
export type { ITributeMaterialRequirementGroup, ITributeRequirementSummary }
