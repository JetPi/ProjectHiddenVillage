import { useMemo, useState } from 'react'
import {
  useAllDeckRulesetsQuery,
  useCreateDeckRulesetMutation,
  useDeleteDeckRulesetMutation,
  useUpdateDeckRulesetMutation,
} from '@/services/queries/deckRulesetQueries'
import type {
  ICreateDeckRulesetRequest,
  IDeckRuleset,
  IUpdateDeckRulesetRequest,
} from '@/types/deckRuleset'
import type {
  IDeckRulesetDraft,
  IDeckRulesetValidationViolation,
} from '@/views/admin/types/deckRulesetAdminTypes'

const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_NAME_LENGTH = 64
const MAX_DECK_CARD_COUNT = 200
const MAX_COPIES_PER_CARD = 99
const MAX_RESTRICTION_COPIES = 99
const MAX_TIMEOUTS_BEFORE_FORFEIT = 10

const EMPTY_DRAFT: IDeckRulesetDraft = {
  key: '',
  name: '',
  isActive: true,
  // A new format joins the quick-match queue unless the admin deliberately marks it host-only.
  availableInQuickMatch: true,
  leaderCount: 1,
  nonLeaderCardCount: 50,
  maxCopiesPerNonLeaderCard: 4,
  requireLeaderColorMatch: true,
  allowChakraCards: false,
  allowSummonCards: false,
  sortOrder: 0,
  clockEnabled: true,
  mainPhaseSeconds: 60,
  otherPhaseSeconds: 30,
  playerPoolSeconds: 1800,
  timeoutsBeforeForfeit: 3,
  restrictions: [],
}

function toDraft(ruleset: IDeckRuleset): IDeckRulesetDraft {
  return {
    key: ruleset.key,
    name: ruleset.name,
    isActive: ruleset.isActive,
    availableInQuickMatch: ruleset.availableInQuickMatch,
    leaderCount: ruleset.leaderCount,
    nonLeaderCardCount: ruleset.nonLeaderCardCount,
    maxCopiesPerNonLeaderCard: ruleset.maxCopiesPerNonLeaderCard,
    requireLeaderColorMatch: ruleset.requireLeaderColorMatch,
    allowChakraCards: ruleset.allowChakraCards,
    allowSummonCards: ruleset.allowSummonCards,
    sortOrder: ruleset.sortOrder,
    clockEnabled: ruleset.clockEnabled,
    mainPhaseSeconds: ruleset.mainPhaseSeconds,
    otherPhaseSeconds: ruleset.otherPhaseSeconds,
    playerPoolSeconds: ruleset.playerPoolSeconds,
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
        cardId: restriction.cardId.trim().toLowerCase(),
        maxCopies: restriction.maxCopies,
      }))
      .sort((left, right) => left.cardId.localeCompare(right.cardId)),
  })
}

function toCreatePayload(draft: IDeckRulesetDraft): ICreateDeckRulesetRequest {
  return {
    key: draft.key.trim().toLowerCase(),
    name: draft.name.trim(),
    isActive: draft.isActive,
    availableInQuickMatch: draft.availableInQuickMatch,
    leaderCount: draft.leaderCount,
    nonLeaderCardCount: draft.nonLeaderCardCount,
    maxCopiesPerNonLeaderCard: draft.maxCopiesPerNonLeaderCard,
    requireLeaderColorMatch: draft.requireLeaderColorMatch,
    allowChakraCards: draft.allowChakraCards,
    allowSummonCards: draft.allowSummonCards,
    sortOrder: draft.sortOrder,
    clockEnabled: draft.clockEnabled,
    mainPhaseSeconds: draft.mainPhaseSeconds,
    otherPhaseSeconds: draft.otherPhaseSeconds,
    playerPoolSeconds: draft.playerPoolSeconds,
    timeoutsBeforeForfeit: draft.timeoutsBeforeForfeit,
    cardRestrictions: draft.restrictions.map((restriction) => ({
      cardId: restriction.cardId.trim(),
      maxCopies: restriction.maxCopies,
    })),
  }
}

function toUpdatePayload(draft: IDeckRulesetDraft): IUpdateDeckRulesetRequest {
  return {
    name: draft.name.trim(),
    isActive: draft.isActive,
    availableInQuickMatch: draft.availableInQuickMatch,
    leaderCount: draft.leaderCount,
    nonLeaderCardCount: draft.nonLeaderCardCount,
    maxCopiesPerNonLeaderCard: draft.maxCopiesPerNonLeaderCard,
    requireLeaderColorMatch: draft.requireLeaderColorMatch,
    allowChakraCards: draft.allowChakraCards,
    allowSummonCards: draft.allowSummonCards,
    sortOrder: draft.sortOrder,
    clockEnabled: draft.clockEnabled,
    mainPhaseSeconds: draft.mainPhaseSeconds,
    otherPhaseSeconds: draft.otherPhaseSeconds,
    playerPoolSeconds: draft.playerPoolSeconds,
    timeoutsBeforeForfeit: draft.timeoutsBeforeForfeit,
    cardRestrictions: draft.restrictions.map((restriction) => ({
      cardId: restriction.cardId.trim(),
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

  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0) {
    violations.push({ messageKey: 'admin.rulesets.validation.sortOrder' })
  }

  // The action clock: a zero budget arms an already-expired deadline, and a stop longer than the whole-game pool
  // would make the pool the only limit.
  if (
    !Number.isInteger(draft.mainPhaseSeconds)
    || draft.mainPhaseSeconds < 1
    || !Number.isInteger(draft.otherPhaseSeconds)
    || draft.otherPhaseSeconds < 1
    || !Number.isInteger(draft.playerPoolSeconds)
    || draft.playerPoolSeconds < 1
  ) {
    violations.push({ messageKey: 'admin.rulesets.validation.clockBudget' })
  } else if (
    draft.mainPhaseSeconds > draft.playerPoolSeconds
    || draft.otherPhaseSeconds > draft.playerPoolSeconds
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

  const seenCardIds = new Set<string>()
  for (const restriction of draft.restrictions) {
    const cardId = restriction.cardId.trim().toLowerCase()

    if (cardId.length === 0) {
      continue
    }

    if (seenCardIds.has(cardId)) {
      violations.push({ messageKey: 'admin.rulesets.validation.restrictionDuplicates' })
      break
    }

    seenCardIds.add(cardId)

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
    setEditedDraft({ ...draft, ...patch })
  }

  const addRestriction = (cardId: string) => {
    const trimmedCardId = cardId.trim()
    if (!trimmedCardId) {
      return
    }

    const alreadyPresent = draft.restrictions.some(
      (restriction) => restriction.cardId.trim().toLowerCase() === trimmedCardId.toLowerCase(),
    )

    if (alreadyPresent) {
      return
    }

    patchDraft({
      restrictions: [...draft.restrictions, { cardId: trimmedCardId, maxCopies: 0 }],
    })
  }

  const updateRestrictionMaxCopies = (cardId: string, maxCopies: number) => {
    patchDraft({
      restrictions: draft.restrictions.map((restriction) =>
        restriction.cardId === cardId ? { ...restriction, maxCopies } : restriction,
      ),
    })
  }

  const removeRestriction = (cardId: string) => {
    patchDraft({
      restrictions: draft.restrictions.filter((restriction) => restriction.cardId !== cardId),
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
    remove,
  }
}

export type IDeckRulesetAdminModel = ReturnType<typeof useDeckRulesetAdminModel>
