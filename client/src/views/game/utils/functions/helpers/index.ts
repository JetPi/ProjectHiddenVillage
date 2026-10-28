import i18n from '@/i18n'
import type { ICardCatalogItemResponse } from '@/types/cardCatalog'
import { PhaseValues } from "@/views/game/components/constants/gamePhaseActionRow"
import type { IGameOutcomeResponse, IGameStateResponse, ISupportChainEntryResponse } from "@/services/api/gameApi"
import type {
  IActionLogViewActor,
  IActionLogViewEntry,
  IEffectTargetingState,
  IGameOutcomePresentation,
  IGameOutcomeStanding,
  ISummonTargetingState,
  ISupportChainViewActor,
  ISupportChainViewEntry,
  ISupportChainViewNegatedTarget,
} from '@/views/game/types'
import { SUPPORT_CHAIN_VISIBLE_ROW_COUNT } from '@/views/game/utils/contants'
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
    case 'SummonFromZone':
      return PhaseValues['select-prompt-summon-from-zone']
    case 'DestroyFromZone':
      return PhaseValues['select-prompt-destroy-from-zone']
    case 'FreezeFromZone':
      return PhaseValues['select-prompt-freeze-from-zone']
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
      ? i18n.t('game.tribute.titleSatisfied', { selected: selectedCount, required: requiredCount })
      : i18n.t('game.tribute.titlePending', {
        selected: selectedCount,
        required: requiredCount,
        needs: materialSummary,
      }),
  }
}

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

  return i18n.t('game.phase.tributeNeeds', { needs: summary.materialSummary })
}

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

  return i18n.t('game.phase.effectTargetsNeeds', { needs: remainingCount })
}

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

  const newestEntry = resolvedEntries[resolvedEntries.length - 1]

  return resolvedEntries.map((entry) => ({
    ...entry,
    negatedBySequence: negatedBySequenceByEntrySequence.get(entry.sequence) ?? null,
    resolvesNext: entry.entryId === newestEntry.entryId,
  }))
}

function shouldShowSupportChainBubble(entries: ISupportChainViewEntry[]): boolean {
  return entries.length > 0
}

/**
 * Whether the chain has outgrown the height budget the action log below it depends on. The bubble keeps its heading,
 * count and LIFO note fixed; only the list scrolls, and only once it would otherwise push the panel past five rows.
 */
function shouldSupportChainScroll(entries: ISupportChainViewEntry[]): boolean {
  return entries.length > SUPPORT_CHAIN_VISIBLE_ROW_COUNT
}

const ACTION_LOG_ACTOR_LABEL_KEYS = {
  you: 'game.actionLog.actorYou',
  opponent: 'game.actionLog.actorOpponent',
  system: 'game.actionLog.actorSystem',
} as const satisfies Record<IActionLogViewActor, string>

/**
 * The wordings the client knows how to build. An action type that is not listed here is not lost: the server's own
 * `message` is rendered instead, which is what keeps a newly logged engine event readable before anyone writes a
 * template for it.
 */
const ACTION_LOG_EVENT_TEXT_KEYS = {
  game_created: 'game.actionLog.event.gameCreated',
  player_joined: 'game.actionLog.event.playerJoined',
  starting_player_assigned: 'game.actionLog.event.startingPlayerChosen',
  starting_player_prompted: 'game.actionLog.event.startingPlayerPrompted',
  turn_started: 'game.actionLog.event.turnStarted',
  phase_started: 'game.actionLog.event.phaseStarted',
  action_step_action_declared: 'game.actionLog.event.actionDeclared',
  action_step_pass_declared: 'game.actionLog.event.actionPassed',
  support_window_pass_declared: 'game.actionLog.event.supportWindowPassed',
  end_step_declared: 'game.actionLog.event.endStepDeclared',
  prompt_resolved: 'game.actionLog.event.promptResolved',
  mulligan_prompted: 'game.actionLog.event.mulliganPrompted',
  card_summoned: 'game.actionLog.event.cardSummoned',
  card_summoned_with_requirement: 'game.actionLog.event.cardSummonedWithRequirement',
  support_set: 'game.actionLog.event.supportSet',
  support_activated: 'game.actionLog.event.supportActivated',
  attack_declared: 'game.actionLog.event.attackDeclared',
  leader_ability_used: 'game.actionLog.event.leaderAbilityUsed',
  character_ability_used: 'game.actionLog.event.characterAbilityUsed',
  clock_timed_out: 'game.actionLog.event.clockTimedOut',
  game_ended: 'game.actionLog.event.gameEnded',
} as const

type TActionLogKnownActionType = keyof typeof ACTION_LOG_EVENT_TEXT_KEYS

function isKnownActionLogActionType(actionType: string): actionType is TActionLogKnownActionType {
  return Object.prototype.hasOwnProperty.call(ACTION_LOG_EVENT_TEXT_KEYS, actionType)
}

/**
 * Engine tokens arrive as `MainPhase` / `AttackResolution`; the log wants prose, not the enum name, and there is no
 * translation key per phase because the phase names are shared engine vocabulary rather than player-facing copy.
 */
function formatActionLogEngineToken(token: string): string {
  return token
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
}

function resolveActionLogActor(playerId: string | null, normalizedAuthUserId: string): IActionLogViewActor {
  const normalizedPlayerId = normalizeId(playerId ?? undefined)
  if (normalizedPlayerId.length === 0) {
    return 'system'
  }

  if (normalizedAuthUserId.length === 0) {
    return 'opponent'
  }

  return normalizedPlayerId === normalizedAuthUserId ? 'you' : 'opponent'
}

/**
 * The engine's own phase bookkeeping.
 *
 * Starting a turn walks the server through several transitions in one go (main, draw, refresh), and publishing each
 * as its own line fills the panel with rows nobody acted on. Consecutive runs of these entries collapse into one row
 * that lists the phases instead; a lone transition - the one a player caused by declaring an attack, for instance -
 * keeps its own row.
 */
const ACTION_LOG_BOOKKEEPING_ACTION_TYPES = new Set<string>(['turn_started', 'phase_started'])

function toActionLogViewEntry(
  entry: NonNullable<IGameStateResponse['actionLog']>[number],
  normalizedAuthUserId: string,
  cardById?: ReadonlyMap<string, ICardCatalogItemResponse>,
): IActionLogViewEntry {
  const actor = resolveActionLogActor(entry.playerId, normalizedAuthUserId)
  const catalogCard = entry.cardDefinitionId
    ? cardById?.get(entry.cardDefinitionId.trim().toLowerCase()) ?? null
    : null
  const displayName = entry.displayName ?? catalogCard?.displayName ?? null
  const targetDisplayName = entry.targetDisplayName ?? null

  const text = isKnownActionLogActionType(entry.actionType)
    ? i18n.t(ACTION_LOG_EVENT_TEXT_KEYS[entry.actionType], {
      actor: i18n.t(ACTION_LOG_ACTOR_LABEL_KEYS[actor]),
      card: displayName ?? i18n.t('game.actionLog.unknownCard'),
      target: targetDisplayName ?? i18n.t('game.actionLog.unknownTarget'),
      phase: entry.phase ? formatActionLogEngineToken(entry.phase) : '',
      turn: (entry.turnNumber ?? 0).toString(),
    })
    : entry.message

  return {
    entryId: entry.entryId,
    sequence: entry.sequence,
    timestampUtc: entry.timestampUtc,
    actionType: entry.actionType,
    category: entry.category,
    actor,
    cardInstanceId: entry.cardInstanceId,
    displayName,
    targetDisplayName,
    phase: entry.phase,
    turnNumber: entry.turnNumber,
    details: null,
    text,
  }
}

/**
 * The player-facing action log, oldest first.
 *
 * The server has already filtered what this player may read (see `GameActionLogPublishing`), so this only phrases it:
 * the actor is resolved against the viewer, card names come from the entry or the catalog, and an unknown action type
 * falls back to the server's message rather than vanishing from the panel. Consecutive phase-bookkeeping entries are
 * merged into a single turn-start row, which is what keeps the panel readable.
 */
function buildActionLogView(
  gameInstance: IGameStateResponse,
  authUserId?: string,
  cardById?: ReadonlyMap<string, ICardCatalogItemResponse>,
): IActionLogViewEntry[] {
  const log = gameInstance.actionLog ?? []
  if (log.length === 0) {
    return []
  }

  const normalizedAuthUserId = normalizeId(authUserId)
  const sortedEntries = [...log].sort((left, right) => left.sequence - right.sequence)
  const viewEntries: IActionLogViewEntry[] = []

  for (let index = 0; index < sortedEntries.length; index += 1) {
    const entry = sortedEntries[index]

    if (!ACTION_LOG_BOOKKEEPING_ACTION_TYPES.has(entry.actionType)) {
      viewEntries.push(toActionLogViewEntry(entry, normalizedAuthUserId, cardById))
      continue
    }

    let runEnd = index
    while (
      runEnd + 1 < sortedEntries.length
      && ACTION_LOG_BOOKKEEPING_ACTION_TYPES.has(sortedEntries[runEnd + 1].actionType)
    ) {
      runEnd += 1
    }

    const run = sortedEntries.slice(index, runEnd + 1)
    index = runEnd

    if (run.length === 1) {
      viewEntries.push(toActionLogViewEntry(run[0], normalizedAuthUserId, cardById))
      continue
    }

    const firstEntry = run[0]
    const phases = [...new Set(run
      .map((runEntry) => runEntry.phase)
      .filter((phase): phase is string => Boolean(phase))
      .map(formatActionLogEngineToken))]

    viewEntries.push({
      ...toActionLogViewEntry(firstEntry, normalizedAuthUserId, cardById),
      text: i18n.t('game.actionLog.event.turnStart'),
      turnNumber: run.find((runEntry) => runEntry.turnNumber !== null)?.turnNumber ?? null,
      // The phases move into the detail line, so the row stops repeating one of them in its own chip.
      phase: null,
      details: phases.length > 0 ? phases.join(' · ') : null,
    })
  }

  return viewEntries
}

/**
 * Why the game ended, worded for the player reading it. The same `GameEndReason` reads very differently from the
 * winner's and the loser's side ("your opponent ran out of time" vs "you ran out of time"), and a timeout ending is
 * not the same story as a leader's life reaching 0, so every reason carries one line per standing.
 */
function resolveGameOutcomeReasonText(reason: string, standing: IGameOutcomeStanding): string {
  switch (reason) {
    case 'LeaderLifeDepleted':
      return standing === 'victory'
        ? i18n.t('game.outcome.reason.leaderLifeDepleted.victory')
        : standing === 'defeat'
          ? i18n.t('game.outcome.reason.leaderLifeDepleted.defeat')
          : i18n.t('game.outcome.reason.leaderLifeDepleted.draw')
    case 'DeckOut':
      return standing === 'victory'
        ? i18n.t('game.outcome.reason.deckOut.victory')
        : standing === 'defeat'
          ? i18n.t('game.outcome.reason.deckOut.defeat')
          : i18n.t('game.outcome.reason.deckOut.draw')
    case 'ForfeitByTimeout':
      return standing === 'victory'
        ? i18n.t('game.outcome.reason.forfeitByTimeout.victory')
        : standing === 'defeat'
          ? i18n.t('game.outcome.reason.forfeitByTimeout.defeat')
          : i18n.t('game.outcome.reason.forfeitByTimeout.draw')
    case 'ClockExpired':
      return standing === 'victory'
        ? i18n.t('game.outcome.reason.clockExpired.victory')
        : standing === 'defeat'
          ? i18n.t('game.outcome.reason.clockExpired.defeat')
          : i18n.t('game.outcome.reason.clockExpired.draw')
    case 'Resigned':
      return standing === 'victory'
        ? i18n.t('game.outcome.reason.resigned.victory')
        : standing === 'defeat'
          ? i18n.t('game.outcome.reason.resigned.defeat')
          : i18n.t('game.outcome.reason.resigned.draw')
    default:
      return standing === 'victory'
        ? i18n.t('game.outcome.reason.unknown.victory')
        : standing === 'defeat'
          ? i18n.t('game.outcome.reason.unknown.defeat')
          : i18n.t('game.outcome.reason.unknown.draw')
  }
}

function buildGameOutcomePresentation(
  outcome: IGameOutcomeResponse | null | undefined,
  authUserId?: string,
): IGameOutcomePresentation | null {
  if (!outcome) {
    return null
  }

  const normalizedAuthUserId = normalizeId(authUserId)
  const isWinner = normalizedAuthUserId.length > 0
    && normalizeId(outcome.winnerPlayerId ?? '') === normalizedAuthUserId
  const isLoser = outcome.loserPlayerIds.some((playerId) => normalizeId(playerId) === normalizedAuthUserId)

  const standing: IGameOutcomeStanding = isWinner ? 'victory' : isLoser ? 'defeat' : 'draw'

  return {
    standing,
    headline:
      standing === 'victory'
        ? i18n.t('game.outcome.victory')
        : standing === 'defeat'
          ? i18n.t('game.outcome.defeat')
          : i18n.t('game.outcome.draw'),
    reason: resolveGameOutcomeReasonText(outcome.reason, standing),
  }
}

export {
  normalizeId,
  getPhaseValue,
  getPhaseThemeClasses,
  getTributeRequirementSummary,
  getTributeSelectionPhaseValue,
  buildSupportChainView,
  shouldShowSupportChainBubble,
  shouldSupportChainScroll,
  buildActionLogView,
  formatActionLogEngineToken,
  buildGameOutcomePresentation,
}
export type { ITributeMaterialRequirementGroup, ITributeRequirementSummary }
