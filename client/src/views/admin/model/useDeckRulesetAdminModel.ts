import { useMemo, useState } from 'react'
import {
  useAllDeckRulesetsQuery,
  useCreateDeckRulesetMutation,
  useDeleteDeckRulesetMutation,
  useReorderDeckRulesetsMutation,
  useUpdateDeckRulesetMutation,
} from '@/services/queries/deckRulesetQueries'
import type {
  ICreateDeckRulesetRequest,
  IDeckRuleset,
  IDeckRulesetCardRestrictionMatchType,
  IUpdateDeckRulesetRequest,
} from '@/types/deckRuleset'
import type {
  IDeckRulesetDraft,
  IDeckRulesetValidationViolation,
} from '@/views/admin/types/deckRulesetAdminTypes'

const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_NAME_LENGTH = 64
const MAX_KEY_LENGTH = 64
const MAX_DECK_CARD_COUNT = 200
const MAX_COPIES_PER_CARD = 99
const MAX_RESTRICTION_COPIES = 99
const MAX_TIMEOUTS_BEFORE_FORFEIT = 10
/** Mirrors the `Code` column of a card rule. */
const MAX_RESTRICTION_CODE_LENGTH = 32
const RESTRICTION_CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/
/** Mirrors `DeckRulesetShapeRules.MaxPoolSeconds` on the server, which caps the pool at four hours. */
const MAX_PLAYER_POOL_MINUTES = 240
const MIN_PLAYER_POOL_MINUTES = 0.5

/**
 * The machine-readable key a new format gets before the admin touches anything: the name, lower-cased, with every
 * run of other characters collapsed into a single dash. Creating a format therefore never means typing a slug; the
 * field stays editable for the rare case where a hand-picked key matters.
 */
function toRulesetKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_KEY_LENGTH)
    .replace(/-+$/g, '')
}

function secondsToMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 10) / 10
}

function minutesToSeconds(minutes: number): number {
  return Math.round(minutes * 60)
}

const EMPTY_DRAFT: IDeckRulesetDraft = {
  key: '',
  name: '',
  isActive: true,
  cardPoolMode: 'Open',
  // A new format joins the quick-match queue unless the admin deliberately marks it host-only.
  availableInQuickMatch: true,
  leaderCount: 1,
  nonLeaderCardCount: 50,
  maxCopiesPerNonLeaderCard: 4,
  requireLeaderColorMatch: true,
  clockEnabled: true,
  mainPhaseSeconds: 60,
  otherPhaseSeconds: 30,
  playerPoolMinutes: 30,
  timeoutsBeforeForfeit: 3,
  restrictions: [],
}

function toDraft(ruleset: IDeckRuleset): IDeckRulesetDraft {
  return {
    key: ruleset.key,
    name: ruleset.name,
    isActive: ruleset.isActive,
    cardPoolMode: ruleset.cardPoolMode,
    availableInQuickMatch: ruleset.availableInQuickMatch,
    leaderCount: ruleset.leaderCount,
    nonLeaderCardCount: ruleset.nonLeaderCardCount,
    maxCopiesPerNonLeaderCard: ruleset.maxCopiesPerNonLeaderCard,
    requireLeaderColorMatch: ruleset.requireLeaderColorMatch,
    clockEnabled: ruleset.clockEnabled,
    mainPhaseSeconds: ruleset.mainPhaseSeconds,
    otherPhaseSeconds: ruleset.otherPhaseSeconds,
    playerPoolMinutes: secondsToMinutes(ruleset.playerPoolSeconds),
    timeoutsBeforeForfeit: ruleset.timeoutsBeforeForfeit,
    restrictions: ruleset.cardRestrictions.map((restriction) => ({ ...restriction })),
  }
}

function buildDraftSignature(draft: IDeckRulesetDraft): string {
  return JSON.stringify({
    ...draft,
    key: draft.key.trim().toLowerCase(),
    name: draft.name.trim(),
    restrictions: [...draft.restrictions]
      .map((restriction) => ({
        matchType: restriction.matchType,
        code: restriction.code.trim().toUpperCase(),
        maxCopies: restriction.maxCopies,
      }))
      .sort((left, right) =>
        `${left.matchType}:${left.code}`.localeCompare(`${right.matchType}:${right.code}`)),
  })
}

function toCreatePayload(draft: IDeckRulesetDraft): ICreateDeckRulesetRequest {
  return {
    key: draft.key.trim().toLowerCase(),
    name: draft.name.trim(),
    isActive: draft.isActive,
    cardPoolMode: draft.cardPoolMode,
    availableInQuickMatch: draft.availableInQuickMatch,
    leaderCount: draft.leaderCount,
    nonLeaderCardCount: draft.nonLeaderCardCount,
    maxCopiesPerNonLeaderCard: draft.maxCopiesPerNonLeaderCard,
    requireLeaderColorMatch: draft.requireLeaderColorMatch,
    clockEnabled: draft.clockEnabled,
    mainPhaseSeconds: draft.mainPhaseSeconds,
    otherPhaseSeconds: draft.otherPhaseSeconds,
    playerPoolSeconds: minutesToSeconds(draft.playerPoolMinutes),
    timeoutsBeforeForfeit: draft.timeoutsBeforeForfeit,
    cardRestrictions: draft.restrictions.map((restriction) => ({
      matchType: restriction.matchType,
      code: restriction.code.trim().toUpperCase(),
      maxCopies: restriction.maxCopies,
    })),
  }
}

function toUpdatePayload(draft: IDeckRulesetDraft): IUpdateDeckRulesetRequest {
  return {
    name: draft.name.trim(),
    isActive: draft.isActive,
    cardPoolMode: draft.cardPoolMode,
    availableInQuickMatch: draft.availableInQuickMatch,
    leaderCount: draft.leaderCount,
    nonLeaderCardCount: draft.nonLeaderCardCount,
    maxCopiesPerNonLeaderCard: draft.maxCopiesPerNonLeaderCard,
    requireLeaderColorMatch: draft.requireLeaderColorMatch,
    clockEnabled: draft.clockEnabled,
    mainPhaseSeconds: draft.mainPhaseSeconds,
    otherPhaseSeconds: draft.otherPhaseSeconds,
    playerPoolSeconds: minutesToSeconds(draft.playerPoolMinutes),
    timeoutsBeforeForfeit: draft.timeoutsBeforeForfeit,
    cardRestrictions: draft.restrictions.map((restriction) => ({
      matchType: restriction.matchType,
      code: restriction.code.trim().toUpperCase(),
      maxCopies: restriction.maxCopies,
    })),
  }
}

function buildViolations(
  draft: IDeckRulesetDraft,
  isCreating: boolean,
): IDeckRulesetValidationViolation[] {
  const violations: IDeckRulesetValidationViolation[] = []
  const key = draft.key.trim().toLowerCase()

  if (isCreating) {
    if (key.length === 0) {
      violations.push({ messageKey: 'admin.rulesets.validation.keyRequired' })
    } else if (!KEY_PATTERN.test(key)) {
      violations.push({ messageKey: 'admin.rulesets.validation.keyFormat' })
    }
  }

  const name = draft.name.trim()
  if (name.length === 0) {
    violations.push({ messageKey: 'admin.rulesets.validation.nameRequired' })
  } else if (name.length > MAX_NAME_LENGTH) {
    violations.push({ messageKey: 'admin.rulesets.validation.nameTooLong', params: { max: MAX_NAME_LENGTH } })
  }

  if (draft.leaderCount !== 1) {
    violations.push({ messageKey: 'admin.rulesets.validation.leaderCount' })
  }

  if (
    !Number.isInteger(draft.nonLeaderCardCount)
    || draft.nonLeaderCardCount < 1
    || draft.nonLeaderCardCount > MAX_DECK_CARD_COUNT
  ) {
    violations.push({
      messageKey: 'admin.rulesets.validation.cardCount',
      params: { max: MAX_DECK_CARD_COUNT },
    })
  }

  if (
    !Number.isInteger(draft.maxCopiesPerNonLeaderCard)
    || draft.maxCopiesPerNonLeaderCard < 1
    || draft.maxCopiesPerNonLeaderCard > MAX_COPIES_PER_CARD
  ) {
    violations.push({
      messageKey: 'admin.rulesets.validation.maxCopies',
      params: { max: MAX_COPIES_PER_CARD },
    })
  }

  // The action clock: a zero budget arms an already-expired deadline, and a stop longer than the whole-game pool
  // would make the pool the only limit. The pool is edited in minutes but compared in seconds, so the two fields
  // keep the unit the server evaluates.
  if (
    !Number.isInteger(draft.mainPhaseSeconds)
    || draft.mainPhaseSeconds < 1
    || !Number.isInteger(draft.otherPhaseSeconds)
    || draft.otherPhaseSeconds < 1
  ) {
    violations.push({ messageKey: 'admin.rulesets.validation.clockBudget' })
  }

  if (
    !Number.isFinite(draft.playerPoolMinutes)
    || draft.playerPoolMinutes < MIN_PLAYER_POOL_MINUTES
    || draft.playerPoolMinutes > MAX_PLAYER_POOL_MINUTES
  ) {
    violations.push({
      messageKey: 'admin.rulesets.validation.playerPoolMinutes',
      params: { min: MIN_PLAYER_POOL_MINUTES, max: MAX_PLAYER_POOL_MINUTES },
    })
  } else if (
    draft.mainPhaseSeconds > minutesToSeconds(draft.playerPoolMinutes)
    || draft.otherPhaseSeconds > minutesToSeconds(draft.playerPoolMinutes)
  ) {
    violations.push({ messageKey: 'admin.rulesets.validation.clockBudgetAbovePool' })
  }

  if (
    !Number.isInteger(draft.timeoutsBeforeForfeit)
    || draft.timeoutsBeforeForfeit < 1
    || draft.timeoutsBeforeForfeit > MAX_TIMEOUTS_BEFORE_FORFEIT
  ) {
    violations.push({
      messageKey: 'admin.rulesets.validation.clockTimeouts',
      params: { max: MAX_TIMEOUTS_BEFORE_FORFEIT },
    })
  }

  // A closed pool with no allowing rule would fail every deck, so it is refused before it is saved rather than
  // looking like a broken format afterwards.
  if (draft.cardPoolMode === 'AllowList' && !draft.restrictions.some((restriction) => restriction.maxCopies > 0)) {
    violations.push({ messageKey: 'admin.rulesets.validation.allowListEmpty' })
  }

  const seenMatchers = new Set<string>()
  for (const restriction of draft.restrictions) {
    const code = restriction.code.trim().toUpperCase()

    if (code.length === 0) {
      continue
    }

    if (code.length > MAX_RESTRICTION_CODE_LENGTH || !RESTRICTION_CODE_PATTERN.test(code)) {
      violations.push({
        messageKey: 'admin.rulesets.validation.restrictionCodeFormat',
        params: { max: MAX_RESTRICTION_CODE_LENGTH },
      })
      break
    }

    // A set is the segment before the first dash, so a dash inside a set rule would match nothing.
    if (restriction.matchType === 'Set' && code.includes('-')) {
      violations.push({ messageKey: 'admin.rulesets.validation.restrictionSetCodeHasDash' })
      break
    }

    const matcherKey = `${restriction.matchType}:${code}`
    if (seenMatchers.has(matcherKey)) {
      violations.push({ messageKey: 'admin.rulesets.validation.restrictionDuplicates' })
      break
    }

    seenMatchers.add(matcherKey)

    if (
      !Number.isInteger(restriction.maxCopies)
      || restriction.maxCopies < 0
      || restriction.maxCopies > MAX_RESTRICTION_COPIES
    ) {
      violations.push({
        messageKey: 'admin.rulesets.validation.restrictionMaxCopies',
        params: { max: MAX_RESTRICTION_COPIES },
      })
      break
    }
  }

  return violations
}

export function useDeckRulesetAdminModel() {
  const allRulesetsQuery = useAllDeckRulesetsQuery()
  const createMutation = useCreateDeckRulesetMutation()
  const updateMutation = useUpdateDeckRulesetMutation()
  const deleteMutation = useDeleteDeckRulesetMutation()
  const reorderMutation = useReorderDeckRulesetsMutation()

  const [selectedRulesetId, setSelectedRulesetId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [editedDraft, setEditedDraft] = useState<IDeckRulesetDraft | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)

  const rulesets = useMemo(() => allRulesetsQuery.data ?? [], [allRulesetsQuery.data])

  const selectedRuleset = useMemo(
    () => rulesets.find((ruleset) => ruleset.id === selectedRulesetId) ?? null,
    [rulesets, selectedRulesetId],
  )

  const loadedDraft = useMemo(
    () => (selectedRuleset ? toDraft(selectedRuleset) : null),
    [selectedRuleset],
  )

  const draft = editedDraft ?? (isCreating ? EMPTY_DRAFT : loadedDraft) ?? EMPTY_DRAFT

  const baselineSignature = useMemo(
    () => savedSignature ?? buildDraftSignature(loadedDraft ?? EMPTY_DRAFT),
    [savedSignature, loadedDraft],
  )

  const violations = useMemo(() => buildViolations(draft, isCreating), [draft, isCreating])
  const draftSignature = useMemo(() => buildDraftSignature(draft), [draft])
  const isDirty = draftSignature !== baselineSignature
  const isSaving = createMutation.isPending || updateMutation.isPending
  const canSave = violations.length === 0 && isDirty && !isSaving

  const patchDraft = (patch: Partial<IDeckRulesetDraft>) => {
    const nextDraft = { ...draft, ...patch }

    // While a format is new its key follows the name, so creating one never means typing a slug. A key the admin
    // typed by hand stops following: the derivation only runs while the key still equals the previous name's slug.
    if (isCreating && patch.name !== undefined && draft.key === toRulesetKey(draft.name)) {
      nextDraft.key = toRulesetKey(patch.name)
    }

    setEditedDraft(nextDraft)
  }

  const addRestriction = (
    matchType: IDeckRulesetCardRestrictionMatchType,
    code: string,
    maxCopies?: number,
  ) => {
    const normalizedCode = code.trim().toUpperCase()
    if (!normalizedCode) {
      return
    }

    const alreadyPresent = draft.restrictions.some(
      (restriction) =>
        restriction.matchType === matchType
        && restriction.code.trim().toUpperCase() === normalizedCode,
    )

    if (alreadyPresent) {
      return
    }

    // A new rule in an open pool is a ban until the admin raises it; in a closed pool it has to allow something or
    // it would be a rule that removes cards from a pool it is already not in.
    const defaultMaxCopies = maxCopies
      ?? (draft.cardPoolMode === 'AllowList' ? draft.maxCopiesPerNonLeaderCard : 0)

    patchDraft({
      restrictions: [
        ...draft.restrictions,
        { matchType, code: normalizedCode, maxCopies: defaultMaxCopies },
      ],
    })
  }

  const updateRestrictionMaxCopies = (
    matchType: IDeckRulesetCardRestrictionMatchType,
    code: string,
    maxCopies: number,
  ) => {
    patchDraft({
      restrictions: draft.restrictions.map((restriction) =>
        restriction.matchType === matchType && restriction.code === code
          ? { ...restriction, maxCopies }
          : restriction,
      ),
    })
  }

  const removeRestriction = (matchType: IDeckRulesetCardRestrictionMatchType, code: string) => {
    patchDraft({
      restrictions: draft.restrictions.filter(
        (restriction) => !(restriction.matchType === matchType && restriction.code === code),
      ),
    })
  }

  const selectRuleset = (rulesetId: string) => {
    setSelectedRulesetId(rulesetId)
    setIsCreating(false)
    setEditedDraft(null)
    setSavedSignature(null)
  }

  const startCreate = () => {
    setSelectedRulesetId(null)
    setIsCreating(true)
    setEditedDraft({ ...EMPTY_DRAFT, restrictions: [] })
    setSavedSignature(null)
  }

  const save = async (): Promise<IDeckRuleset> => {
    const savedRuleset = isCreating
      ? await createMutation.mutateAsync(toCreatePayload(draft))
      : await updateMutation.mutateAsync({
          rulesetId: selectedRulesetId ?? '',
          request: toUpdatePayload(draft),
        })

    setSelectedRulesetId(savedRuleset.id)
    setIsCreating(false)
    setEditedDraft(null)
    setSavedSignature(null)

    return savedRuleset
  }

  /**
   * Moves one format to another slot and sends the resulting order. The rail has already moved the row; this only
   * has to name the order it produced.
   */
  const reorderRulesets = async (fromIndex: number, toIndex: number): Promise<void> => {
    const rulesetIds = rulesets.map((ruleset) => ruleset.id)

    if (
      fromIndex === toIndex
      || fromIndex < 0
      || toIndex < 0
      || fromIndex >= rulesetIds.length
      || toIndex >= rulesetIds.length
    ) {
      return
    }

    const [moved] = rulesetIds.splice(fromIndex, 1)
    rulesetIds.splice(toIndex, 0, moved)

    await reorderMutation.mutateAsync(rulesetIds)
  }

  const remove = async (): Promise<void> => {
    if (!selectedRulesetId) {
      return
    }

    await deleteMutation.mutateAsync(selectedRulesetId)
    setSelectedRulesetId(null)
    setIsCreating(false)
    setEditedDraft(null)
    setSavedSignature(null)
  }

  return {
    rulesets,
    isLoading: allRulesetsQuery.isLoading,
    isError: allRulesetsQuery.isError,
    selectedRulesetId,
    selectedRuleset,
    isCreating,
    draft,
    violations,
    isDirty,
    isSaving,
    isDeleting: deleteMutation.isPending,
    canSave,
    patchDraft,
    addRestriction,
    updateRestrictionMaxCopies,
    removeRestriction,
    selectRuleset,
    startCreate,
    save,
    reorderRulesets,
    remove,
  }
}

export type IDeckRulesetAdminModel = ReturnType<typeof useDeckRulesetAdminModel>
