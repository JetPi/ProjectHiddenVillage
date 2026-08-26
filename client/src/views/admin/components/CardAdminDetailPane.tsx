import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppButton } from '@/components/ui'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { CountConstraintField } from './CountConstraintField'
import { CardAdminSelectedCardSummary } from './CardAdminSelectedCardSummary'
import { useCardAdminEffectEditorModel } from '@/views/admin/model/useCardAdminEffectEditorModel'
import {
  appendPredicateEntries,
  createDefaultAttributeModification,
  createDefaultChakraAdjustment,
  createDefaultContextRule,
  createDefaultEffect,
  createDefaultFaceStateLock,
  createDefaultKeywordModification,
  createDefaultMoveCardAction,
  createDefaultPassiveConsequence,
  createDefaultPassiveReevaluation,
  createDefaultPredicate,
  createDefaultSummonCardFlip,
  createDefaultTargetRule,
  createDefaultZoneAmountRequirement,
  createDefaultZoneRequirementSet,
  getPredicateEntries,
  isAttackNegationRuntimeEffect,
  isSummonOrTributeRuntimeEffect,
  normalizeEffectId,
  normalizeRevealRuleZone,
  parseNullableInteger,
  removePredicateEntryAt,
  renderEmptySelectionState,
  resolveAttributeValueConstraintMode,
  resolveCountConstraintMode,
  resolveCountConstraintSeedValue,
  resolveCountConstraintValue,
  resolveRevealPostConditionRuleSet,
  resolveTargetZoneOptions,
} from '@/views/admin/utils'
import { fetchCardCatalogEffectConditionKeywords } from '@/services/api/cardCatalogApi'
import {
  CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS,
  type ICardCatalogEffectExecutionConditionArgumentKey,
} from '@/types/cardCatalogExecutionCondition'
import {
  ATTRIBUTE_OPERATION_OPTIONS,
  ATTRIBUTE_TYPE_OPTIONS,
  CHAKRA_OPERATION_OPTIONS,
  CONDITION_OPTIONS,
  EFFECT_CONDITION_KEYWORD_OPTIONS_FALLBACK,
  EFFECT_DURATION_MODE_OPTIONS,
  EFFECT_KIND_OPTIONS,
  EFFECT_TIMING_OPTIONS,
  EXECUTION_FLOW_MODE_OPTIONS,
  EXECUTION_TARGET_SOURCE_OPTIONS,
  FACE_STATE_LOCK_OPERATION_OPTIONS,
  FACE_STATE_OPTIONS,
  FACE_STATE_TARGET_CATEGORY_OPTIONS,
  KEYWORD_OPERATION_OPTIONS,
  KEYWORD_TARGET_TYPE_OPTIONS,
  MATCH_MODE_OPTIONS,
  MOVE_CARD_DECK_PLACEMENT_OPTIONS,
  MOVE_CARD_DESTINATION_RANGE_OPTIONS,
  MOVE_CARD_MULTI_ORDERING_OPTIONS,
  MOVE_CARD_OPERATION_OPTIONS,
  MOVE_CARD_ZONE_OPTIONS,
  PASSIVE_CONSEQUENCE_EFFECT_OPTIONS,
  PASSIVE_MODE_OPTIONS,
  PASSIVE_SCOPE_OPTIONS,
  PASSIVE_TARGET_POLICY_OPTIONS,
  PASSIVE_TRIGGER_KIND_OPTIONS,
  PLAYER_ZONE_OPTIONS,
  PREDICATE_OPERATOR_OPTIONS,
  PREDICATE_PROPERTY_OPTIONS,
  RESTRICTIONS_OPTIONS,
  REVEAL_TIMING_MODE_OPTIONS,
  RULE_OPERATOR_OPTIONS,
  RUNTIME_EFFECT_OPTIONS,
  TARGET_LOCATION_SELECTOR_KIND_OPTIONS,
  TARGET_RANGE_OPTIONS,
  TARGET_TYPE_OPTIONS,
  TRIBUTE_ROLE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminDetailEditorProps, ICardAdminDetailPaneProps } from '@/views/admin/types/cardAdminDetailPane'
import type { ICountConstraintMode } from '@/views/admin/types/countConstraintField'
import type {
  ICardCatalogEffectRequest,
  ICardCatalogPredicateProperty,
} from '@/services/api/types/cardCatalog'

export function CardAdminDetailPane({ selectedCard }: ICardAdminDetailPaneProps) {
  return (
    <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4">
      {selectedCard ? (
        <CardAdminDetailEditor key={selectedCard.id} selectedCard={selectedCard} />
      ) : (
        renderEmptySelectionState('Select a card from the left rail to prepare editing.')
      )}
    </div>
  )
}

function CardAdminDetailEditor({ selectedCard }: ICardAdminDetailEditorProps) {
  const editorModel = useCardAdminEffectEditorModel(selectedCard)
  const [conditionToAdd, setConditionToAdd] = useState('')
  const [effectConditionKeywordOptions, setEffectConditionKeywordOptions] = useState<string[]>(
    () => [...EFFECT_CONDITION_KEYWORD_OPTIONS_FALLBACK],
  )
  const [collapsedEffects, setCollapsedEffects] = useState<Set<number>>(
    () => new Set(selectedCard.effects.map((_, index) => index)),
  )

  useEffect(() => {
    let isDisposed = false

    async function loadEffectConditionKeywords() {
      try {
        const serverKeywords = await fetchCardCatalogEffectConditionKeywords()
        if (isDisposed) {
          return
        }

        const normalizedKeywords = serverKeywords
          .map((keyword) => keyword.trim())
          .filter((keyword) => keyword.length > 0)

        if (normalizedKeywords.length > 0) {
          setEffectConditionKeywordOptions(Array.from(new Set(normalizedKeywords)))
        }
      } catch {
        // Keep fallback list when metadata fetch fails.
      }
    }

    void loadEffectConditionKeywords()

    return () => {
      isDisposed = true
    }
  }, [])

  const isSaveDisabled = editorModel.isSaving
  const parsedEffects = editorModel.draft.effects
  const allConditionOptions = useMemo(
    () => Array.from(new Set([...CONDITION_OPTIONS, ...editorModel.draft.conditions])),
    [editorModel.draft.conditions],
  )
  const availableConditionOptions = useMemo(
    () => allConditionOptions.filter((condition) => !editorModel.draft.conditions.includes(condition)),
    [allConditionOptions, editorModel.draft.conditions],
  )
  const effectIdOptions = useMemo(
    () => Array.from(new Set(parsedEffects.map((effect) => normalizeEffectId(effect.id)).filter((id) => id.length > 0))),
    [parsedEffects],
  )
  const linkedEffectGroups = useMemo(() => {
    const effectIdSet = new Set(effectIdOptions)

    return parsedEffects.flatMap((effect) => {
      const sourceId = normalizeEffectId(effect.id)
      if (!sourceId) {
        return []
      }

      const onSuccessTarget = normalizeEffectId(effect.onSuccessEffectId)
      const onFailureTarget = normalizeEffectId(effect.onFailureEffectId)
      const nextGroup = {
        sourceId,
        onSuccessTarget: onSuccessTarget && effectIdSet.has(onSuccessTarget)
          ? onSuccessTarget
          : null,
        onFailureTarget: onFailureTarget && effectIdSet.has(onFailureTarget)
          ? onFailureTarget
          : null,
      }

      if (!nextGroup.onSuccessTarget && !nextGroup.onFailureTarget) {
        return []
      }

      return [nextGroup]
    })
  }, [effectIdOptions, parsedEffects])
  const updateEffects = (nextEffects: ICardCatalogEffectRequest[]) => {
    editorModel.setEffects(nextEffects)
  }

  const updateEffectAt = (effectIndex: number, updater: (effect: ICardCatalogEffectRequest) => ICardCatalogEffectRequest) => {
    const nextEffects = parsedEffects.map((effect, index) => (index === effectIndex ? updater(effect) : effect))
    updateEffects(nextEffects)
  }

  const removeEffectAt = (effectIndex: number) => {
    if (parsedEffects.length <= 1) {
      return
    }

    const nextEffects = parsedEffects.filter((_, index) => index !== effectIndex)
    updateEffects(nextEffects)

    setCollapsedEffects((current) => {
      const next = new Set<number>()
      current.forEach((index) => {
        if (index < effectIndex) {
          next.add(index)
          return
        }

        if (index > effectIndex) {
          next.add(index - 1)
        }
      })

      return next
    })
  }

  const addEffect = () => {
    const nextEffects = [createDefaultEffect(), ...parsedEffects]
    updateEffects(nextEffects)

    setCollapsedEffects((current) => {
      const next = new Set<number>()
      next.add(0)
      current.forEach((index) => {
        next.add(index + 1)
      })

      return next
    })
  }

  const toggleEffectCollapsedAt = (effectIndex: number) => {
    setCollapsedEffects((current) => {
      const next = new Set(current)
      if (next.has(effectIndex)) {
        next.delete(effectIndex)
      } else {
        next.add(effectIndex)
      }

      return next
    })
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-full">
          <CardAdminSelectedCardSummary
            card={selectedCard}
            draft={editorModel.draft}
            onTypeChange={editorModel.setType}
            onColorChange={editorModel.setColor}
            onPowerChange={editorModel.setPower}
            onDamageChange={editorModel.setDamage}
            onLifeChange={editorModel.setLife}
            onHealthChange={editorModel.setHealth}
          />
        </div>

        <div className="flex h-full flex-col gap-3">
          <div className="grid grid-cols-1 gap-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]" htmlFor="card-description">
              Description
            </label>
            <textarea
              id="card-description"
              value={editorModel.draft.description}
              onChange={(event) => editorModel.setDescription(event.target.value)}
              className="min-h-[96px] w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]" htmlFor="support-effect">
              Support Effect
            </label>
            <textarea
              id="support-effect"
              value={editorModel.draft.supportEffect}
              onChange={(event) => editorModel.setSupportEffect(event.target.value)}
              className="min-h-[96px] flex-1 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Conditions
        </label>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <select
            value={conditionToAdd}
            onChange={(event) => {
              const nextCondition = event.target.value
              setConditionToAdd(nextCondition)

              if (!nextCondition) {
                return
              }

              editorModel.addCondition(nextCondition)
              setConditionToAdd('')
            }}
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            <option value="">Select a condition to add...</option>
            {availableConditionOptions.map((conditionOption) => (
              <option key={conditionOption} value={conditionOption}>{conditionOption}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
            <span>No Normal Summon</span>
            <span className="relative inline-flex h-5 w-9 items-center">
              <input
                type="checkbox"
                checked={editorModel.draft.cannotBeNormalSummoned}
                onChange={(event) => editorModel.setCannotBeNormalSummoned(event.target.checked)}
                className="peer sr-only"
              />
              <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-amber-500/70" />
              <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
            </span>
          </label>
        </div>

        {editorModel.draft.conditions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {editorModel.draft.conditions.map((condition) => (
              <div
                key={condition}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-1 text-xs text-[var(--text-primary)]"
              >
                <span>{condition}</span>
                <button
                  type="button"
                  onClick={() => editorModel.removeCondition(condition)}
                  className="rounded-full px-1 leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                  aria-label={`Remove ${condition}`}
                >
                  X
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {editorModel.errors.conditions ? (
          <p className="text-xs text-red-500">{editorModel.errors.conditions}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Effects</p>
              <AppButton
                type="button"
                variant="ghost"
                onClick={addEffect}
              >
                Add Effect
              </AppButton>
            </div>

            <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-sky-500/45 bg-[var(--surface-muted)] p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Interlinked Effects</p>
              {linkedEffectGroups.length > 0 ? (
                <div className="space-y-1">
                  {linkedEffectGroups.map((group) => (
                    <div
                      key={group.sourceId}
                      className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-primary)]"
                    >
                      <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-0.5 font-semibold">{group.sourceId}</span>

                      {group.onSuccessTarget ? (
                        <>
                          <span className="text-[var(--text-secondary)]">On Success</span>
                          <span className="text-[var(--text-secondary)]">-&gt;</span>
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-700">{group.onSuccessTarget}</span>
                        </>
                      ) : null}

                      {group.onFailureTarget ? (
                        <>
                          <span className="text-[var(--text-secondary)]">On Failure</span>
                          <span className="text-[var(--text-secondary)]">-&gt;</span>
                          <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-700">{group.onFailureTarget}</span>
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">No linked effects are currently configured.</p>
              )}
            </div>

            {parsedEffects.map((effect, effectIndex) => (
              <div key={`effect-${effectIndex}`} className="space-y-3 rounded-xl border border-[var(--border-subtle)] border-l-4 border-l-slate-400/55 bg-[var(--surface)] p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{effect.id.trim().length > 0 ? effect.id.trim() : `Effect ${effectIndex + 1}`}</p>
                    {normalizeEffectId(effect.onSuccessEffectId) ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        On Success: {normalizeEffectId(effect.onSuccessEffectId)}
                      </span>
                    ) : null}
                    {normalizeEffectId(effect.onFailureEffectId) ? (
                      <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                        On Failure: {normalizeEffectId(effect.onFailureEffectId)}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleEffectCollapsedAt(effectIndex)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
                      aria-label={collapsedEffects.has(effectIndex) ? 'Expand effect' : 'Collapse effect'}
                      title={collapsedEffects.has(effectIndex) ? 'Expand' : 'Collapse'}
                    >
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        aria-hidden="true"
                        className={`h-4 w-4 transition-transform duration-200 ${collapsedEffects.has(effectIndex) ? '' : 'rotate-180'}`}
                      >
                        <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled={parsedEffects.length <= 1}
                      onClick={() => removeEffectAt(effectIndex)}
                      className="px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Remove Effect"
                    >
                      X
                    </button>
                  </div>
                </div>

                {!collapsedEffects.has(effectIndex) ? (
                  <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">ID</label>
                    <input
                      type="text"
                      value={effect.id}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, id: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    />
                  </div>

                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                      <span>is Subordinate</span>
                      <span className="relative inline-flex h-5 w-9 items-center">
                        <input
                          type="checkbox"
                          checked={effect.isSubordinate}
                          onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, isSubordinate: event.target.checked }))}
                          className="peer sr-only"
                        />
                        <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-amber-500/70" />
                        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                      </span>
                    </label>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Runtime Effect Type</label>
                    <select
                      value={effect.runtimeEffectType}
                      onChange={(event) =>
                        updateEffectAt(effectIndex, (current) => {
                          const nextRuntimeEffectType = event.target.value
                          const isTributeEffect = nextRuntimeEffectType === 'Tribute'
                          const supportsTributeRole = isSummonOrTributeRuntimeEffect(nextRuntimeEffectType)
                          const hidesTargetCount = isAttackNegationRuntimeEffect(nextRuntimeEffectType)
                          const shouldEnsureRevealTargetRule = nextRuntimeEffectType === 'Reveal Card'
                          const nextTargetRules = shouldEnsureRevealTargetRule
                            && current.targetRules.rules.length === 0
                            ? [
                                {
                                  ...createDefaultTargetRule(),
                                  inZone: 'Hand',
                                },
                              ]
                            : current.targetRules.rules
                          const normalizedTargetRules = nextRuntimeEffectType === 'Reveal Card'
                            ? nextTargetRules.map((rule) => ({
                                ...rule,
                                inZone: normalizeRevealRuleZone(rule.inZone),
                              }))
                            : nextTargetRules

                          return {
                            ...current,
                            runtimeEffectType: nextRuntimeEffectType,
                            executionTargetSource:
                              nextRuntimeEffectType === 'Reveal Card'
                                ? 'Selected Targets'
                                : current.executionTargetSource,
                            suppressSummonedTargetsEffectsWhileOnField:
                              nextRuntimeEffectType === 'Summon Card'
                                ? current.suppressSummonedTargetsEffectsWhileOnField
                                : false,
                            revealTimingMode:
                              nextRuntimeEffectType === 'Reveal Card'
                                ? current.revealTimingMode
                                : 'Reveal Last',
                            revealPostConditionRuleSet:
                              nextRuntimeEffectType === 'Reveal Card'
                                ? current.revealPostConditionRuleSet
                                : null,
                            revealPostConditionRestriction:
                              nextRuntimeEffectType === 'Reveal Card'
                                ? current.revealPostConditionRestriction
                                : null,
                            revealPostConditionPredicate:
                              nextRuntimeEffectType === 'Reveal Card'
                                ? current.revealPostConditionPredicate
                                : null,
                            attributeModifications:
                              nextRuntimeEffectType === 'Change Values'
                                ? current.attributeModifications
                                : [],
                            chakraAdjustments:
                              nextRuntimeEffectType === 'Alter Resources'
                                ? current.chakraAdjustments
                                : [],
                            summonCardFlips:
                              nextRuntimeEffectType === 'Alter Resources'
                                ? current.summonCardFlips
                                : [],
                            faceStateLocks:
                              nextRuntimeEffectType === 'Alter Resources'
                                ? current.faceStateLocks
                                : [],
                            moveCardActions:
                              nextRuntimeEffectType === 'Move Card'
                                ? current.moveCardActions
                                : [],
                            targetRules: {
                              ...current.targetRules,
                              autoSelectAllValidTargets:
                                nextRuntimeEffectType === 'Reveal Card'
                                  ? true
                                  : current.targetRules.autoSelectAllValidTargets,
                              exactTargetCount: hidesTargetCount ? null : current.targetRules.exactTargetCount,
                              minimumTargetCount: hidesTargetCount ? null : current.targetRules.minimumTargetCount,
                              maximumTargetCount: hidesTargetCount ? null : current.targetRules.maximumTargetCount,
                              tributeComposition: isTributeEffect
                                ? current.targetRules.tributeComposition
                                : null,
                              rules: normalizedTargetRules.map((rule) => (
                                supportsTributeRole
                                  ? rule
                                  : { ...rule, tributeRole: null }
                              )),
                            },
                          }
                        })}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {RUNTIME_EFFECT_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Effect Type</label>
                    <select
                      value={effect.effectType}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, effectType: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {EFFECT_KIND_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Timing</label>
                    <select
                      value={effect.timing}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, timing: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {EFFECT_TIMING_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Duration</label>
                    <select
                      value={effect.durationMode}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, durationMode: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {EFFECT_DURATION_MODE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Passive Mode</label>
                    <select
                      value={effect.passiveMode}
                      onChange={(event) =>
                        updateEffectAt(effectIndex, (current) => {
                          const nextPassiveMode = event.target.value
                          const isPassiveEnabled = nextPassiveMode !== 'None'

                          return {
                            ...current,
                            passiveMode: nextPassiveMode,
                            passiveReevaluation: isPassiveEnabled
                              ? current.passiveReevaluation ?? createDefaultPassiveReevaluation()
                              : null,
                            passiveConsequences: isPassiveEnabled
                              ? (current.passiveConsequences ?? [])
                              : [],
                          }
                        })}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {PASSIVE_MODE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Range</label>
                    <select
                      value={effect.targetRange}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, targetRange: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {TARGET_RANGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Chakra Cost</label>
                      <label className="inline-flex items-center">
                        <span className="relative inline-flex h-5 w-9 items-center">
                          <input
                            type="checkbox"
                            checked={effect.chakraCost !== null}
                            onChange={(event) =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                chakraCost: event.target.checked ? current.chakraCost ?? 0 : null,
                              }))}
                            className="peer sr-only"
                          />
                          <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-amber-500/70" />
                          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <input
                        type="number"
                        value={effect.chakraCost ?? ''}
                        onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, chakraCost: parseNullableInteger(event.target.value) }))}
                        disabled={effect.chakraCost === null}
                        placeholder={effect.chakraCost === null ? 'Enable to edit' : ''}
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:cursor-not-allowed"
                      />

                      <label className="inline-flex items-center justify-self-end gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                        <span>Optional</span>
                        <span className="relative inline-flex h-5 w-9 items-center">
                          <input
                            type="checkbox"
                            checked={effect.isOptional}
                            onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, isOptional: event.target.checked }))}
                            className="peer sr-only"
                          />
                          <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-amber-500/70" />
                          <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1 md:col-span-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Global Restrictions</label>
                    <select
                      value={effect.globalRestrictions}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, globalRestrictions: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {RESTRICTIONS_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {effect.runtimeEffectType === 'Summon Card' ? (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-amber-500/55 bg-[var(--surface-muted)] p-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={effect.suppressSummonedTargetsEffectsWhileOnField}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            suppressSummonedTargetsEffectsWhileOnField: event.target.checked,
                          }))}
                      />
                      Suppress Summoned Effects On Field
                    </label>
                  </div>
                ) : null}

                {effect.runtimeEffectType === 'Reveal Card' ? (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-emerald-500/55 bg-[var(--surface-muted)] p-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Reveal Timing</label>
                      <select
                        value={effect.revealTimingMode}
                        onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, revealTimingMode: event.target.value }))}
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      >
                        {REVEAL_TIMING_MODE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={resolveRevealPostConditionRuleSet(effect) !== null}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => {
                            const currentRuleSet = resolveRevealPostConditionRuleSet(current)
                            const nextRuleSet = event.target.checked
                              ? currentRuleSet ?? {
                                operator: 'All',
                                restrictions: [
                                  {
                                    matchMode: 'All',
                                    predicates: [createDefaultPredicate()],
                                  },
                                ],
                              }
                              : null

                            return {
                              ...current,
                              revealPostConditionRuleSet: nextRuleSet,
                              revealPostConditionRestriction: null,
                              revealPostConditionPredicate: null,
                              revealTimingMode: event.target.checked ? 'Reveal First' : current.revealTimingMode,
                            }
                          })}
                      />
                      Post-Reveal Rule Set Enabled
                    </label>

                    {resolveRevealPostConditionRuleSet(effect) ? (
                      <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-emerald-500/30 bg-[var(--surface)] p-3 sm:col-span-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Post-Reveal Condition</p>
                          <div className="flex items-center gap-2">
                            <AppButton
                              type="button"
                              variant="ghost"
                              onClick={() =>
                                updateEffectAt(effectIndex, (current) => {
                                  const ruleSet = resolveRevealPostConditionRuleSet(current)
                                  if (!ruleSet) {
                                    return current
                                  }

                                  return {
                                    ...current,
                                    revealPostConditionRuleSet: {
                                      ...ruleSet,
                                      restrictions: [
                                        ...ruleSet.restrictions,
                                        {
                                          matchMode: 'All',
                                          predicates: [createDefaultPredicate()],
                                        },
                                      ],
                                    },
                                    revealPostConditionRestriction: null,
                                    revealPostConditionPredicate: null,
                                  }
                                })}
                            >
                              Add Group
                            </AppButton>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Group Operator</label>
                          <select
                            value={resolveRevealPostConditionRuleSet(effect)?.operator ?? 'All'}
                            onChange={(event) =>
                              updateEffectAt(effectIndex, (current) => {
                                const ruleSet = resolveRevealPostConditionRuleSet(current)
                                if (!ruleSet) {
                                  return current
                                }

                                return {
                                  ...current,
                                  revealPostConditionRuleSet: {
                                    ...ruleSet,
                                    operator: event.target.value,
                                  },
                                  revealPostConditionRestriction: null,
                                  revealPostConditionPredicate: null,
                                }
                              })}
                            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                          >
                            {MATCH_MODE_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>

                        {(resolveRevealPostConditionRuleSet(effect)?.restrictions ?? []).map((restriction, groupIndex) => (
                          <div
                            key={`reveal-post-group-${groupIndex}`}
                            className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-emerald-500/30 bg-[var(--surface-muted)] p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Group {groupIndex + 1}</p>
                              <button
                                type="button"
                                onClick={() =>
                                  updateEffectAt(effectIndex, (current) => {
                                    const ruleSet = resolveRevealPostConditionRuleSet(current)
                                    if (!ruleSet) {
                                      return current
                                    }

                                    return {
                                      ...current,
                                      revealPostConditionRuleSet: {
                                        ...ruleSet,
                                        restrictions: ruleSet.restrictions.filter((_, index) => index !== groupIndex),
                                      },
                                      revealPostConditionRestriction: null,
                                      revealPostConditionPredicate: null,
                                    }
                                  })
                                }
                                className="px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                aria-label="Remove Group"
                              >
                                X
                              </button>
                            </div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Group Match Mode</label>
                                <select
                                  value={restriction.matchMode}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => {
                                      const ruleSet = resolveRevealPostConditionRuleSet(current)
                                      if (!ruleSet) {
                                        return current
                                      }

                                      return {
                                        ...current,
                                        revealPostConditionRuleSet: {
                                          ...ruleSet,
                                          restrictions: ruleSet.restrictions.map((row, rowIndex) =>
                                            rowIndex === groupIndex
                                              ? {
                                                ...row,
                                                matchMode: event.target.value,
                                              }
                                              : row),
                                        },
                                        revealPostConditionRestriction: null,
                                        revealPostConditionPredicate: null,
                                      }
                                    })}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                >
                                  {MATCH_MODE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>

                              <AppButton
                                type="button"
                                variant="ghost"
                                onClick={() =>
                                  updateEffectAt(effectIndex, (current) => {
                                    const ruleSet = resolveRevealPostConditionRuleSet(current)
                                    if (!ruleSet) {
                                      return current
                                    }

                                    return {
                                      ...current,
                                      revealPostConditionRuleSet: {
                                        ...ruleSet,
                                        restrictions: ruleSet.restrictions.map((row, rowIndex) =>
                                          rowIndex === groupIndex
                                            ? {
                                              ...row,
                                              predicates: [...row.predicates, createDefaultPredicate()],
                                            }
                                            : row),
                                      },
                                      revealPostConditionRestriction: null,
                                      revealPostConditionPredicate: null,
                                    }
                                  })}
                              >
                                Add Predicate
                              </AppButton>
                            </div>

                            {restriction.predicates.map((predicate, predicateIndex) => {
                              const predicateEntries = getPredicateEntries(predicate)

                              return (
                                <div
                                  key={`reveal-post-group-${groupIndex}-predicate-${predicateIndex}`}
                                  className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-2"
                                >
                                  <div className="flex flex-wrap items-start gap-2">
                                <select
                                  value={predicate.property}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => {
                                      const ruleSet = resolveRevealPostConditionRuleSet(current)
                                      if (!ruleSet) {
                                        return current
                                      }

                                      return {
                                        ...current,
                                        revealPostConditionRuleSet: {
                                          ...ruleSet,
                                          restrictions: ruleSet.restrictions.map((group, rowGroupIndex) =>
                                            rowGroupIndex === groupIndex
                                              ? {
                                                ...group,
                                                predicates: group.predicates.map((row, rowIndex) =>
                                                  rowIndex === predicateIndex
                                                    ? { ...row, property: event.target.value as ICardCatalogPredicateProperty }
                                                    : row),
                                              }
                                              : group),
                                        },
                                        revealPostConditionRestriction: null,
                                        revealPostConditionPredicate: null,
                                      }
                                    })}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto sm:min-w-[11rem]"
                                >
                                  {PREDICATE_PROPERTY_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>

                                <select
                                  value={predicate.operator}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => {
                                      const ruleSet = resolveRevealPostConditionRuleSet(current)
                                      if (!ruleSet) {
                                        return current
                                      }

                                      return {
                                        ...current,
                                        revealPostConditionRuleSet: {
                                          ...ruleSet,
                                          restrictions: ruleSet.restrictions.map((group, rowGroupIndex) =>
                                            rowGroupIndex === groupIndex
                                              ? {
                                                ...group,
                                                predicates: group.predicates.map((row, rowIndex) =>
                                                  rowIndex === predicateIndex
                                                    ? { ...row, operator: event.target.value }
                                                    : row),
                                              }
                                              : group),
                                        },
                                        revealPostConditionRestriction: null,
                                        revealPostConditionPredicate: null,
                                      }
                                    })}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto sm:min-w-[10rem]"
                                >
                                  {PREDICATE_OPERATOR_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>

                                <div className="min-w-[14rem] flex-1">
                                  <input
                                    type="text"
                                    placeholder={
                                      predicateEntries.length > 0
                                        ? `Add value (current: ${predicateEntries.join(', ')})`
                                        : 'Add value and press Enter'
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key !== 'Enter') {
                                        return
                                      }

                                      event.preventDefault()
                                      const inputValue = event.currentTarget.value

                                      updateEffectAt(effectIndex, (current) => {
                                        const ruleSet = resolveRevealPostConditionRuleSet(current)
                                        if (!ruleSet) {
                                          return current
                                        }

                                        return {
                                          ...current,
                                          revealPostConditionRuleSet: {
                                            ...ruleSet,
                                            restrictions: ruleSet.restrictions.map((group, rowGroupIndex) =>
                                              rowGroupIndex === groupIndex
                                                ? {
                                                  ...group,
                                                  predicates: group.predicates.map((row, rowIndex) =>
                                                    rowIndex === predicateIndex
                                                      ? appendPredicateEntries(row, inputValue)
                                                      : row),
                                                }
                                                : group),
                                          },
                                          revealPostConditionRestriction: null,
                                          revealPostConditionPredicate: null,
                                        }
                                      })

                                      event.currentTarget.value = ''
                                    }}
                                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                  />
                                </div>
                              </div>

                              {predicateEntries.length > 0 ? (
                                <div className="w-full flex flex-wrap gap-2">
                                  {predicateEntries.map((entry, entryIndex) => (
                                    <div
                                      key={`${entry}-${entryIndex}`}
                                      className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                                    >
                                      <span>{entry}</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateEffectAt(effectIndex, (current) => {
                                            const ruleSet = resolveRevealPostConditionRuleSet(current)
                                            if (!ruleSet) {
                                              return current
                                            }

                                            return {
                                              ...current,
                                              revealPostConditionRuleSet: {
                                                ...ruleSet,
                                                restrictions: ruleSet.restrictions.map((group, rowGroupIndex) =>
                                                  rowGroupIndex === groupIndex
                                                    ? {
                                                      ...group,
                                                      predicates: group.predicates.map((row, rowIndex) =>
                                                        rowIndex === predicateIndex
                                                          ? removePredicateEntryAt(row, entryIndex)
                                                          : row),
                                                    }
                                                    : group),
                                              },
                                              revealPostConditionRestriction: null,
                                              revealPostConditionPredicate: null,
                                            }
                                          })
                                        }
                                        className="rounded-full px-1 leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                                        aria-label={`Remove ${entry}`}
                                      >
                                        X
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
                                  <span>Ignore Case</span>
                                  <span className="relative inline-flex h-5 w-9 items-center">
                                    <input
                                      type="checkbox"
                                      checked={predicate.ignoreCase}
                                      onChange={(event) =>
                                        updateEffectAt(effectIndex, (current) => {
                                          const ruleSet = resolveRevealPostConditionRuleSet(current)
                                          if (!ruleSet) {
                                            return current
                                          }

                                          return {
                                            ...current,
                                            revealPostConditionRuleSet: {
                                              ...ruleSet,
                                              restrictions: ruleSet.restrictions.map((group, rowGroupIndex) =>
                                                rowGroupIndex === groupIndex
                                                  ? {
                                                    ...group,
                                                    predicates: group.predicates.map((row, rowIndex) =>
                                                      rowIndex === predicateIndex
                                                        ? { ...row, ignoreCase: event.target.checked }
                                                        : row),
                                                  }
                                                  : group),
                                            },
                                            revealPostConditionRestriction: null,
                                            revealPostConditionPredicate: null,
                                          }
                                        })}
                                      className="peer sr-only"
                                    />
                                    <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-emerald-500/70" />
                                    <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                                  </span>
                                </label>

                                <button
                                  type="button"
                                  onClick={() =>
                                    updateEffectAt(effectIndex, (current) => {
                                      const ruleSet = resolveRevealPostConditionRuleSet(current)
                                      if (!ruleSet) {
                                        return current
                                      }

                                      return {
                                        ...current,
                                        revealPostConditionRuleSet: {
                                          ...ruleSet,
                                          restrictions: ruleSet.restrictions.map((group, rowGroupIndex) =>
                                            rowGroupIndex === groupIndex
                                              ? {
                                                ...group,
                                                predicates: group.predicates.filter((_, rowIndex) => rowIndex !== predicateIndex),
                                              }
                                              : group),
                                        },
                                        revealPostConditionRestriction: null,
                                        revealPostConditionPredicate: null,
                                      }
                                    })
                                  }
                                  className="self-end px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                  aria-label="Remove Predicate"
                                >
                                  X
                                </button>
                              </div>
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-sky-500/55 bg-[var(--surface-muted)] p-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Execution Target Source</label>
                    <select
                      value={effect.executionTargetSource}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, executionTargetSource: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {EXECUTION_TARGET_SOURCE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Execution Flow Mode</label>
                    <select
                      value={effect.executionFlowMode}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, executionFlowMode: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {EXECUTION_FLOW_MODE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">On Success</label>
                    <select
                      value={effect.onSuccessEffectId ?? ''}
                      onChange={(event) =>
                        updateEffectAt(effectIndex, (current) => ({
                          ...current,
                          onSuccessEffectId: event.target.value.trim().length > 0 ? event.target.value : null,
                        }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      <option value="">None</option>
                      {effectIdOptions
                        .filter((id) => id !== normalizeEffectId(effect.id))
                        .map((idOption) => (
                          <option key={idOption} value={idOption}>{idOption}</option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">On Failure</label>
                    <select
                      value={effect.onFailureEffectId ?? ''}
                      onChange={(event) =>
                        updateEffectAt(effectIndex, (current) => ({
                          ...current,
                          onFailureEffectId: event.target.value.trim().length > 0 ? event.target.value : null,
                        }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      <option value="">None</option>
                      {effectIdOptions
                        .filter((id) => id !== normalizeEffectId(effect.id))
                        .map((idOption) => (
                          <option key={idOption} value={idOption}>{idOption}</option>
                        ))}
                    </select>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={effect.executionCondition !== null}
                      onChange={(event) =>
                        updateEffectAt(effectIndex, (current) => ({
                          ...current,
                          executionCondition: event.target.checked
                            ? {
                                argumentKey: CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS[0],
                                expectedValue: '',
                                ignoreCase: true,
                                negate: false,
                              }
                            : null,
                        }))}
                    />
                    Execution Condition Enabled
                  </label>

                  {effect.executionCondition ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Condition Argument Key</label>
                        <select
                          value={effect.executionCondition.argumentKey}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              executionCondition: current.executionCondition
                                ? {
                                    ...current.executionCondition,
                                    argumentKey: event.target.value as ICardCatalogEffectExecutionConditionArgumentKey,
                                  }
                                : null,
                            }))}
                          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        >
                          {CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Condition Expected Value</label>
                        <input
                          type="text"
                          value={effect.executionCondition.expectedValue}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              executionCondition: current.executionCondition
                                ? { ...current.executionCondition, expectedValue: event.target.value }
                                : null,
                            }))}
                          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        />
                      </div>

                      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                        <input
                          type="checkbox"
                          checked={effect.executionCondition.ignoreCase}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              executionCondition: current.executionCondition
                                ? { ...current.executionCondition, ignoreCase: event.target.checked }
                                : null,
                            }))}
                        />
                        Ignore Case
                      </label>

                      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                        <input
                          type="checkbox"
                          checked={effect.executionCondition.negate}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              executionCondition: current.executionCondition
                                ? { ...current.executionCondition, negate: event.target.checked }
                                : null,
                            }))}
                        />
                        Negate Condition
                      </label>
                    </>
                  ) : null}

                  {editorModel.errors.effectBranches[effectIndex]?.length ? (
                    <div className="space-y-1 sm:col-span-2">
                      {editorModel.errors.effectBranches[effectIndex].map((error) => (
                        <p key={`${effectIndex}-${error}`} className="text-xs text-red-500">{error}</p>
                      ))}
                    </div>
                  ) : null}
                </div>

                {effect.passiveMode !== 'None' ? (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-violet-500/55 bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Passive Settings</p>

                    <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={effect.passiveReevaluation !== null}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            passiveReevaluation: event.target.checked
                              ? current.passiveReevaluation ?? createDefaultPassiveReevaluation()
                              : null,
                          }))}
                      />
                      Passive Reevaluation Enabled
                    </label>

                    {effect.passiveReevaluation ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Reevaluation Scope</label>
                          <select
                            value={effect.passiveReevaluation.scope}
                            onChange={(event) =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                passiveReevaluation: current.passiveReevaluation
                                  ? { ...current.passiveReevaluation, scope: event.target.value }
                                  : null,
                              }))}
                            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                          >
                            {PASSIVE_SCOPE_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Trigger Kind</label>
                          <select
                            value={effect.passiveReevaluation.triggerKinds[0] ?? 'Any'}
                            onChange={(event) =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                passiveReevaluation: current.passiveReevaluation
                                  ? { ...current.passiveReevaluation, triggerKinds: [event.target.value] }
                                  : null,
                              }))}
                            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                          >
                            {PASSIVE_TRIGGER_KIND_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-violet-500/35 bg-[var(--surface)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Passive Consequences</p>
                        <AppButton
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              passiveConsequences: [...(current.passiveConsequences ?? []), createDefaultPassiveConsequence()],
                            }))}
                        >
                          Add Consequence
                        </AppButton>
                      </div>

                      {(effect.passiveConsequences ?? []).map((consequence, consequenceIndex) => (
                        <div key={`passive-consequence-${consequenceIndex}`} className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3 sm:grid-cols-3">
                          <select
                            value={consequence.consequenceEffectTypeKey}
                            onChange={(event) =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                passiveConsequences: (current.passiveConsequences ?? []).map((row, index) =>
                                  index === consequenceIndex ? { ...row, consequenceEffectTypeKey: event.target.value } : row),
                              }))}
                            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                          >
                            {PASSIVE_CONSEQUENCE_EFFECT_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>

                          <select
                            value={consequence.targetPolicy}
                            onChange={(event) =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                passiveConsequences: (current.passiveConsequences ?? []).map((row, index) =>
                                  index === consequenceIndex
                                    ? { ...row, targetPolicy: event.target.value }
                                    : row),
                              }))}
                            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                          >
                            {PASSIVE_TARGET_POLICY_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>

                          <AppButton
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                passiveConsequences: (current.passiveConsequences ?? []).filter((_, index) => index !== consequenceIndex),
                              }))}
                          >
                            Remove
                          </AppButton>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {effect.runtimeEffectType === 'Gain Effect' ? (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-fuchsia-500/55 bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Gain Effect Settings</p>

                    <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-fuchsia-500/35 bg-[var(--surface)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Keyword Modifications</p>
                        <AppButton
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              keywordModifications: [...(current.keywordModifications ?? []), createDefaultKeywordModification()],
                            }))}
                        >
                          Add Keyword Mod
                        </AppButton>
                      </div>

                      {(effect.keywordModifications ?? []).map((modification, keywordIndex) => (
                        <div key={`keyword-mod-${keywordIndex}`} className="space-y-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                            <select
                              value={modification.targetType}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  keywordModifications: (current.keywordModifications ?? []).map((row, index) =>
                                    index === keywordIndex ? { ...row, targetType: event.target.value } : row),
                                }))}
                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              {KEYWORD_TARGET_TYPE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>

                            <select
                              value={modification.operation}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  keywordModifications: (current.keywordModifications ?? []).map((row, index) =>
                                    index === keywordIndex ? { ...row, operation: event.target.value } : row),
                                }))}
                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              {KEYWORD_OPERATION_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>

                            <select
                              value={modification.keyword}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  keywordModifications: (current.keywordModifications ?? []).map((row, index) =>
                                    index === keywordIndex ? { ...row, keyword: event.target.value } : row),
                                }))}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              <option value="">Select keyword</option>
                              {(effectConditionKeywordOptions.includes(modification.keyword) || !modification.keyword.trim()
                                ? effectConditionKeywordOptions
                                : [modification.keyword, ...effectConditionKeywordOptions]).map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  keywordModifications: (current.keywordModifications ?? []).filter((_, index) => index !== keywordIndex),
                                }))}
                              className="inline-flex w-fit px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                              aria-label="Remove keyword modification"
                            >
                              X
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-emerald-500/55 bg-[var(--surface-muted)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Rules</p>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Rule Operator</label>
                      <select
                        value={effect.targetRules.operator}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            targetRules: { ...current.targetRules, operator: event.target.value },
                          }))}
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      >
                        {RULE_OPERATOR_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {effect.runtimeEffectType === 'Tribute' ? (
                    <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={effect.targetRules.tributeComposition !== null}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            targetRules: {
                              ...current.targetRules,
                              tributeComposition: event.target.checked
                                ? {
                                  exactTributeCount: null,
                                  minimumTributeCount: null,
                                  maximumTributeCount: null,
                                  requireSingleSummonTarget: true,
                                  requireDistinctSummonAndTributes: true,
                                }
                                : null,
                            },
                          }))}
                      />
                      Tribute Composition Enabled
                    </label>
                  ) : null}

                  <div className={`grid grid-cols-1 gap-3 ${effect.runtimeEffectType === 'Tribute' && effect.targetRules.tributeComposition ? 'sm:grid-cols-2' : ''}`}>
                    {!isAttackNegationRuntimeEffect(effect.runtimeEffectType) ? (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Count</label>
                        <CountConstraintField
                          mode={resolveCountConstraintMode(
                            effect.targetRules.exactTargetCount,
                            effect.targetRules.minimumTargetCount,
                            effect.targetRules.maximumTargetCount,
                            effect.targetRules.autoSelectAllValidTargets ?? false,
                          )}
                          value={resolveCountConstraintValue(
                            resolveCountConstraintMode(
                              effect.targetRules.exactTargetCount,
                              effect.targetRules.minimumTargetCount,
                              effect.targetRules.maximumTargetCount,
                              effect.targetRules.autoSelectAllValidTargets ?? false,
                            ),
                            effect.targetRules.exactTargetCount,
                            effect.targetRules.minimumTargetCount,
                            effect.targetRules.maximumTargetCount,
                          )}
                          onModeChange={(selectedMode) =>
                            updateEffectAt(effectIndex, (current) => {
                              const isAllMode = selectedMode === 'All'
                              const seedValue = resolveCountConstraintSeedValue(
                                current.targetRules.exactTargetCount,
                                current.targetRules.minimumTargetCount,
                                current.targetRules.maximumTargetCount,
                                current.targetRules.autoSelectAllValidTargets ?? false,
                              )

                              return {
                                ...current,
                                targetRules: {
                                  ...current.targetRules,
                                  autoSelectAllValidTargets: isAllMode,
                                  exactTargetCount: selectedMode === 'Exact' ? seedValue : null,
                                  minimumTargetCount: selectedMode === 'Minimum' ? seedValue : null,
                                  maximumTargetCount: selectedMode === 'Maximum' ? seedValue : null,
                                  rules: isAllMode
                                    ? current.targetRules.rules.map((rule) => ({
                                      ...rule,
                                      exactSelectedTargetCount: null,
                                      minimumSelectedTargetCount: null,
                                      maximumSelectedTargetCount: null,
                                    }))
                                    : current.targetRules.rules,
                                },
                              }
                            })}
                          onValueChange={(parsedValue) =>
                            updateEffectAt(effectIndex, (current) => {
                              const selectedMode = resolveCountConstraintMode(
                                current.targetRules.exactTargetCount,
                                current.targetRules.minimumTargetCount,
                                current.targetRules.maximumTargetCount,
                                current.targetRules.autoSelectAllValidTargets ?? false,
                              )

                              return {
                                ...current,
                                targetRules: {
                                  ...current.targetRules,
                                  exactTargetCount: selectedMode === 'Exact' ? parsedValue : null,
                                  minimumTargetCount: selectedMode === 'Minimum' ? parsedValue : null,
                                  maximumTargetCount: selectedMode === 'Maximum' ? parsedValue : null,
                                },
                              }
                            })}
                        />
                      </div>
                    ) : null}

                    {effect.runtimeEffectType === 'Tribute' && effect.targetRules.tributeComposition ? (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Tribute Count</label>
                        <CountConstraintField
                          mode={resolveCountConstraintMode(
                            effect.targetRules.tributeComposition.exactTributeCount,
                            effect.targetRules.tributeComposition.minimumTributeCount,
                            effect.targetRules.tributeComposition.maximumTributeCount,
                          )}
                          value={resolveCountConstraintValue(
                            resolveCountConstraintMode(
                              effect.targetRules.tributeComposition.exactTributeCount,
                              effect.targetRules.tributeComposition.minimumTributeCount,
                              effect.targetRules.tributeComposition.maximumTributeCount,
                            ),
                            effect.targetRules.tributeComposition.exactTributeCount,
                            effect.targetRules.tributeComposition.minimumTributeCount,
                            effect.targetRules.tributeComposition.maximumTributeCount,
                          )}
                          onModeChange={(selectedMode) =>
                            updateEffectAt(effectIndex, (current) => {
                              if (!current.targetRules.tributeComposition) {
                                return current
                              }

                              const seedValue = resolveCountConstraintSeedValue(
                                current.targetRules.tributeComposition.exactTributeCount,
                                current.targetRules.tributeComposition.minimumTributeCount,
                                current.targetRules.tributeComposition.maximumTributeCount,
                              )

                              return {
                                ...current,
                                targetRules: {
                                  ...current.targetRules,
                                  tributeComposition: {
                                    ...current.targetRules.tributeComposition,
                                    exactTributeCount: selectedMode === 'Exact' ? seedValue : null,
                                    minimumTributeCount: selectedMode === 'Minimum' ? seedValue : null,
                                    maximumTributeCount: selectedMode === 'Maximum' ? seedValue : null,
                                  },
                                },
                              }
                            })}
                          onValueChange={(parsedValue) =>
                            updateEffectAt(effectIndex, (current) => {
                              if (!current.targetRules.tributeComposition) {
                                return current
                              }

                              const selectedMode = resolveCountConstraintMode(
                                current.targetRules.tributeComposition.exactTributeCount,
                                current.targetRules.tributeComposition.minimumTributeCount,
                                current.targetRules.tributeComposition.maximumTributeCount,
                              )

                              return {
                                ...current,
                                targetRules: {
                                  ...current.targetRules,
                                  tributeComposition: {
                                    ...current.targetRules.tributeComposition,
                                    exactTributeCount: selectedMode === 'Exact' ? parsedValue : null,
                                    minimumTributeCount: selectedMode === 'Minimum' ? parsedValue : null,
                                    maximumTributeCount: selectedMode === 'Maximum' ? parsedValue : null,
                                  },
                                },
                              }
                            })}
                        />
                      </div>
                    ) : null}
                  </div>

                  {effect.runtimeEffectType === 'Tribute' && effect.targetRules.tributeComposition ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                        <input
                          type="checkbox"
                          checked={effect.targetRules.tributeComposition.requireSingleSummonTarget}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              targetRules: current.targetRules.tributeComposition
                                ? {
                                  ...current.targetRules,
                                  tributeComposition: {
                                    ...current.targetRules.tributeComposition,
                                    requireSingleSummonTarget: event.target.checked,
                                  },
                                }
                                : current.targetRules,
                            }))}
                        />
                        Require Single Summon Target
                      </label>

                      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={effect.targetRules.tributeComposition.requireDistinctSummonAndTributes}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              targetRules: current.targetRules.tributeComposition
                                ? {
                                  ...current.targetRules,
                                  tributeComposition: {
                                    ...current.targetRules.tributeComposition,
                                    requireDistinctSummonAndTributes: event.target.checked,
                                  },
                                }
                                : current.targetRules,
                            }))}
                        />
                        Require Distinct Summon And Tributes
                      </label>
                    </div>
                  ) : null}

                  <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-emerald-500/35 bg-[var(--surface-muted)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Rule Rows</p>
                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            targetRules: {
                              ...current.targetRules,
                              rules: [createDefaultTargetRule(), ...current.targetRules.rules],
                            },
                          }))}
                      >
                        Add Target Rule
                      </AppButton>
                    </div>

                    {effect.targetRules.rules.map((targetRule, targetRuleIndex) => {
                      const showsTributeRole = isSummonOrTributeRuntimeEffect(effect.runtimeEffectType)
                      const shouldShowSelectedCountField = !effect.targetRules.autoSelectAllValidTargets
                      const zoneOptions = resolveTargetZoneOptions(effect.runtimeEffectType)
                      const selectedCountField = (
                        <div className="space-y-1">
                          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Selected Count</label>
                          <CountConstraintField
                            mode={resolveCountConstraintMode(
                              targetRule.exactSelectedTargetCount,
                              targetRule.minimumSelectedTargetCount,
                              targetRule.maximumSelectedTargetCount,
                            )}
                            value={resolveCountConstraintValue(
                              resolveCountConstraintMode(
                                targetRule.exactSelectedTargetCount,
                                targetRule.minimumSelectedTargetCount,
                                targetRule.maximumSelectedTargetCount,
                              ),
                              targetRule.exactSelectedTargetCount,
                              targetRule.minimumSelectedTargetCount,
                              targetRule.maximumSelectedTargetCount,
                            )}
                            onModeChange={(selectedMode) =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                targetRules: {
                                  ...current.targetRules,
                                  rules: current.targetRules.rules.map((rule, index) =>
                                    index === targetRuleIndex
                                      ? (() => {
                                        const seedValue = resolveCountConstraintSeedValue(
                                          rule.exactSelectedTargetCount,
                                          rule.minimumSelectedTargetCount,
                                          rule.maximumSelectedTargetCount,
                                        )

                                        return {
                                          ...rule,
                                          exactSelectedTargetCount: selectedMode === 'Exact' ? seedValue : null,
                                          minimumSelectedTargetCount: selectedMode === 'Minimum' ? seedValue : null,
                                          maximumSelectedTargetCount: selectedMode === 'Maximum' ? seedValue : null,
                                        }
                                      })()
                                      : rule),
                                },
                              }))}
                            onValueChange={(parsedValue) =>
                              updateEffectAt(effectIndex, (current) => {
                                const selectedMode = resolveCountConstraintMode(
                                  targetRule.exactSelectedTargetCount,
                                  targetRule.minimumSelectedTargetCount,
                                  targetRule.maximumSelectedTargetCount,
                                )

                                return {
                                  ...current,
                                  targetRules: {
                                    ...current.targetRules,
                                    rules: current.targetRules.rules.map((rule, index) =>
                                      index === targetRuleIndex
                                        ? {
                                          ...rule,
                                          exactSelectedTargetCount: selectedMode === 'Exact' ? parsedValue : null,
                                          minimumSelectedTargetCount: selectedMode === 'Minimum' ? parsedValue : null,
                                          maximumSelectedTargetCount: selectedMode === 'Maximum' ? parsedValue : null,
                                        }
                                        : rule),
                                  },
                                }
                              })}
                          />
                        </div>
                      )

                      return (
                      <div key={`target-rule-${targetRuleIndex}`} className="space-y-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-emerald-500/30 bg-[var(--surface)] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-[var(--text-primary)]">Rule #{targetRuleIndex + 1}</p>
                          <AppButton
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                targetRules: {
                                  ...current.targetRules,
                                  rules: current.targetRules.rules.filter((_, index) => index !== targetRuleIndex),
                                },
                              }))}
                          >
                            Remove
                          </AppButton>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Scope</label>
                                <select
                                  value={targetRule.scope}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      targetRules: {
                                        ...current.targetRules,
                                        rules: current.targetRules.rules.map((rule, index) =>
                                          index === targetRuleIndex ? { ...rule, scope: event.target.value } : rule),
                                      },
                                    }))}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                >
                                  {TARGET_RANGE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Zone</label>
                                <select
                                  value={targetRule.inZone}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      targetRules: {
                                        ...current.targetRules,
                                        rules: current.targetRules.rules.map((rule, index) =>
                                          index === targetRuleIndex
                                            ? {
                                              ...rule,
                                              inZone: event.target.value,
                                              locationSelector: {
                                                kind: rule.locationSelector?.kind ?? 'Any',
                                                supportSlotIndex: rule.locationSelector?.supportSlotIndex ?? null,
                                              },
                                            }
                                            : rule),
                                      },
                                    }))}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                >
                                  {zoneOptions.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Location Selector</label>
                                <select
                                  value={targetRule.locationSelector?.kind ?? 'Any'}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      targetRules: {
                                        ...current.targetRules,
                                        rules: current.targetRules.rules.map((rule, index) =>
                                          index === targetRuleIndex
                                            ? {
                                              ...rule,
                                              locationSelector: {
                                                kind: event.target.value,
                                                supportSlotIndex: event.target.value === 'Support Slot Index'
                                                  ? (rule.locationSelector?.supportSlotIndex ?? 0)
                                                  : null,
                                              },
                                            }
                                            : rule),
                                      },
                                    }))}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                >
                                  {TARGET_LOCATION_SELECTOR_KIND_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>

                              {showsTributeRole ? (
                                <div className="space-y-1">
                                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Tribute Role</label>
                                  <select
                                    value={targetRule.tributeRole ?? ''}
                                    onChange={(event) =>
                                      updateEffectAt(effectIndex, (current) => ({
                                        ...current,
                                        targetRules: {
                                          ...current.targetRules,
                                          rules: current.targetRules.rules.map((rule, index) =>
                                            index === targetRuleIndex
                                              ? { ...rule, tributeRole: event.target.value || null }
                                              : rule),
                                        },
                                      }))}
                                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                  >
                                    <option value="">None</option>
                                    {TRIBUTE_ROLE_OPTIONS.map((option) => (
                                      <option key={option} value={option}>{option}</option>
                                    ))}
                                  </select>
                                </div>
                              ) : shouldShowSelectedCountField ? selectedCountField : null}
                            </div>

                            {targetRule.locationSelector?.kind === 'Support Slot Index' ? (
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Support Slot Index</label>
                                <input
                                  type="number"
                                  min={0}
                                  value={targetRule.locationSelector.supportSlotIndex ?? 0}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      targetRules: {
                                        ...current.targetRules,
                                        rules: current.targetRules.rules.map((rule, index) =>
                                          index === targetRuleIndex
                                            ? {
                                              ...rule,
                                              locationSelector: {
                                                kind: 'Support Slot Index',
                                                supportSlotIndex: parseNullableInteger(event.target.value) ?? 0,
                                              },
                                            }
                                            : rule),
                                      },
                                    }))}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                />
                              </div>
                            ) : null}
                          </div>

                          {showsTributeRole && shouldShowSelectedCountField ? selectedCountField : null}

                          <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Restriction Match Mode</label>
                            <select
                              value={targetRule.restriction.matchMode}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  targetRules: {
                                    ...current.targetRules,
                                    rules: current.targetRules.rules.map((rule, index) =>
                                      index === targetRuleIndex
                                        ? {
                                          ...rule,
                                          restriction: {
                                            ...rule.restriction,
                                            matchMode: event.target.value,
                                          },
                                        }
                                        : rule),
                                  },
                                }))}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              {MATCH_MODE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-emerald-500/25 bg-[var(--surface-muted)] p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-[var(--text-secondary)]">Predicates</p>
                            <AppButton
                              type="button"
                              variant="ghost"
                              onClick={() =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  targetRules: {
                                    ...current.targetRules,
                                    rules: current.targetRules.rules.map((rule, index) =>
                                      index === targetRuleIndex
                                        ? {
                                          ...rule,
                                          restriction: {
                                            ...rule.restriction,
                                            predicates: [createDefaultPredicate(), ...rule.restriction.predicates],
                                          },
                                        }
                                        : rule),
                                  },
                                }))}
                            >
                              Add Predicate
                            </AppButton>
                          </div>

                          {targetRule.restriction.predicates.map((predicate, predicateIndex) => {
                            const predicateEntries = getPredicateEntries(predicate)

                            return (
                            <div key={`predicate-${predicateIndex}`} className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-emerald-500/20 bg-[var(--surface)] p-2">
                              <div className="flex flex-wrap items-start gap-2">
                              <select
                                value={predicate.property}
                                onChange={(event) =>
                                  updateEffectAt(effectIndex, (current) => ({
                                    ...current,
                                    targetRules: {
                                      ...current.targetRules,
                                      rules: current.targetRules.rules.map((rule, index) =>
                                        index === targetRuleIndex
                                          ? {
                                            ...rule,
                                            restriction: {
                                              ...rule.restriction,
                                              predicates: rule.restriction.predicates.map((row, rowIndex) =>
                                                rowIndex === predicateIndex
                                                  ? { ...row, property: event.target.value as ICardCatalogPredicateProperty }
                                                  : row),
                                            },
                                          }
                                          : rule),
                                    },
                                  }))}
                                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto sm:min-w-[11rem]"
                              >
                                {PREDICATE_PROPERTY_OPTIONS.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>

                              <select
                                value={predicate.operator}
                                onChange={(event) =>
                                  updateEffectAt(effectIndex, (current) => ({
                                    ...current,
                                    targetRules: {
                                      ...current.targetRules,
                                      rules: current.targetRules.rules.map((rule, index) =>
                                        index === targetRuleIndex
                                          ? {
                                            ...rule,
                                            restriction: {
                                              ...rule.restriction,
                                              predicates: rule.restriction.predicates.map((row, rowIndex) =>
                                                rowIndex === predicateIndex
                                                  ? { ...row, operator: event.target.value }
                                                  : row),
                                            },
                                          }
                                          : rule),
                                    },
                                  }))}
                                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto sm:min-w-[10rem]"
                              >
                                {PREDICATE_OPERATOR_OPTIONS.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>

                              <div className="min-w-[14rem] flex-1">
                                <input
                                  type="text"
                                  placeholder={
                                    predicateEntries.length > 0
                                      ? `Add value (current: ${predicateEntries.join(', ')})`
                                      : 'Add value and press Enter'
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key !== 'Enter') {
                                      return
                                    }

                                    event.preventDefault()
                                    const inputValue = event.currentTarget.value

                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      targetRules: {
                                        ...current.targetRules,
                                        rules: current.targetRules.rules.map((rule, index) =>
                                          index === targetRuleIndex
                                            ? {
                                              ...rule,
                                              restriction: {
                                                ...rule.restriction,
                                                predicates: rule.restriction.predicates.map((row, rowIndex) =>
                                                  rowIndex === predicateIndex
                                                    ? appendPredicateEntries(row, inputValue)
                                                    : row),
                                              },
                                            }
                                            : rule),
                                      },
                                    }))

                                    event.currentTarget.value = ''
                                  }}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                />
                              </div>
                              </div>

                              {predicateEntries.length > 0 ? (
                                <div className="w-full flex flex-wrap gap-2">
                                  {predicateEntries.map((entry, entryIndex) => (
                                    <div
                                      key={`${entry}-${entryIndex}`}
                                      className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                                    >
                                      <span>{entry}</span>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateEffectAt(effectIndex, (current) => ({
                                            ...current,
                                            targetRules: {
                                              ...current.targetRules,
                                              rules: current.targetRules.rules.map((rule, index) =>
                                                index === targetRuleIndex
                                                  ? {
                                                    ...rule,
                                                    restriction: {
                                                      ...rule.restriction,
                                                      predicates: rule.restriction.predicates.map((row, rowIndex) =>
                                                        rowIndex === predicateIndex
                                                          ? removePredicateEntryAt(row, entryIndex)
                                                          : row),
                                                    },
                                                  }
                                                  : rule),
                                            },
                                          }))
                                        }
                                        className="rounded-full px-1 leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                                        aria-label={`Remove ${entry}`}
                                      >
                                        X
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : null}

                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
                                  <span>Ignore Case</span>
                                  <span className="relative inline-flex h-5 w-9 items-center">
                                    <input
                                      type="checkbox"
                                      checked={predicate.ignoreCase}
                                      onChange={(event) =>
                                        updateEffectAt(effectIndex, (current) => ({
                                          ...current,
                                          targetRules: {
                                            ...current.targetRules,
                                            rules: current.targetRules.rules.map((rule, index) =>
                                              index === targetRuleIndex
                                                ? {
                                                  ...rule,
                                                  restriction: {
                                                    ...rule.restriction,
                                                    predicates: rule.restriction.predicates.map((row, rowIndex) =>
                                                      rowIndex === predicateIndex
                                                        ? { ...row, ignoreCase: event.target.checked }
                                                        : row),
                                                  },
                                                }
                                                : rule),
                                          },
                                        }))}
                                      className="peer sr-only"
                                    />
                                    <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-emerald-500/70" />
                                    <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                                  </span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      targetRules: {
                                        ...current.targetRules,
                                        rules: current.targetRules.rules.map((rule, index) =>
                                          index === targetRuleIndex
                                            ? {
                                              ...rule,
                                              restriction: {
                                                ...rule.restriction,
                                                predicates: rule.restriction.predicates.filter((_, rowIndex) => rowIndex !== predicateIndex),
                                              },
                                            }
                                            : rule),
                                      },
                                    }))}
                                    className="self-end px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                    aria-label="Remove Predicate"
                                >
                                    X
                                  </button>
                              </div>
                            </div>
                            )
                          })}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-cyan-500/55 bg-[var(--surface-muted)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Context Rules</p>

                  <div className="flex justify-end">
                    <AppButton
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        updateEffectAt(effectIndex, (current) => ({
                          ...current,
                          contextRules: [createDefaultContextRule(), ...current.contextRules],
                        }))}
                    >
                      Add Context Rule
                    </AppButton>
                  </div>

                  {effect.contextRules.map((contextRule, contextRuleIndex) => (
                    <div key={`context-rule-${contextRuleIndex}`} className="space-y-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/35 bg-[var(--surface-muted)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[var(--text-primary)]">Context #{contextRuleIndex + 1}</p>
                        <AppButton
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              contextRules: current.contextRules.filter((_, index) => index !== contextRuleIndex),
                            }))}
                        >
                          Remove
                        </AppButton>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/30 bg-[var(--surface)] p-3">
                          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                            <input
                              type="checkbox"
                              checked={contextRule.player !== null}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  contextRules: current.contextRules.map((row, index) =>
                                    index === contextRuleIndex
                                      ? {
                                        ...row,
                                        player: event.target.checked ? { inZone: null, inZoneRequirements: null } : null,
                                      }
                                      : row),
                                }))}
                            />
                            Player Condition Enabled
                          </label>

                          {contextRule.player ? (
                            <>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Player In Zone</label>
                                <select
                                  value={contextRule.player.inZone ?? ''}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      contextRules: current.contextRules.map((row, index) =>
                                        index === contextRuleIndex
                                          ? {
                                            ...row,
                                            player: row.player
                                              ? { ...row.player, inZone: event.target.value || null }
                                              : row.player,
                                          }
                                          : row),
                                    }))}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                >
                                  <option value="">None</option>
                                  {PLAYER_ZONE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>

                              <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                                <input
                                  type="checkbox"
                                  checked={contextRule.player.inZoneRequirements !== null}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      contextRules: current.contextRules.map((row, index) =>
                                        index === contextRuleIndex
                                          ? {
                                            ...row,
                                            player: row.player
                                              ? {
                                                ...row.player,
                                                inZoneRequirements: event.target.checked ? createDefaultZoneRequirementSet() : null,
                                              }
                                              : row.player,
                                          }
                                          : row),
                                    }))}
                                />
                                Player In-Zone Requirements Enabled
                              </label>

                              {contextRule.player.inZoneRequirements ? (
                                <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/25 bg-[var(--surface-muted)] p-2">
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Requirement Operator</label>
                                      <select
                                        value={contextRule.player.inZoneRequirements.operator}
                                        onChange={(event) =>
                                          updateEffectAt(effectIndex, (current) => ({
                                            ...current,
                                            contextRules: current.contextRules.map((row, index) =>
                                              index === contextRuleIndex
                                                ? {
                                                  ...row,
                                                  player: row.player?.inZoneRequirements
                                                    ? {
                                                      ...row.player,
                                                      inZoneRequirements: {
                                                        ...row.player.inZoneRequirements,
                                                        operator: event.target.value,
                                                      },
                                                    }
                                                    : row.player,
                                                }
                                                : row),
                                          }))}
                                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                      >
                                        {RULE_OPERATOR_OPTIONS.map((option) => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <label className="inline-flex h-10 self-end items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]">
                                      <span>Distinct Cards Across Requirements</span>
                                      <span className="relative inline-flex h-5 w-9 items-center">
                                        <input
                                          type="checkbox"
                                          checked={contextRule.player.inZoneRequirements.distinctCardsAcrossRequirements}
                                          onChange={(event) =>
                                            updateEffectAt(effectIndex, (current) => ({
                                              ...current,
                                              contextRules: current.contextRules.map((row, index) =>
                                                index === contextRuleIndex
                                                  ? {
                                                    ...row,
                                                    player: row.player?.inZoneRequirements
                                                      ? {
                                                        ...row.player,
                                                        inZoneRequirements: {
                                                          ...row.player.inZoneRequirements,
                                                          distinctCardsAcrossRequirements: event.target.checked,
                                                        },
                                                      }
                                                      : row.player,
                                                  }
                                                  : row),
                                            }))}
                                          className="peer sr-only"
                                        />
                                        <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-cyan-500/70" />
                                        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                                      </span>
                                    </label>
                                  </div>

                                  <div className="flex justify-end">
                                    <AppButton
                                      type="button"
                                      variant="ghost"
                                      onClick={() =>
                                        updateEffectAt(effectIndex, (current) => ({
                                          ...current,
                                          contextRules: current.contextRules.map((row, index) =>
                                            index === contextRuleIndex
                                              ? {
                                                ...row,
                                                player: row.player?.inZoneRequirements
                                                  ? {
                                                    ...row.player,
                                                    inZoneRequirements: {
                                                      ...row.player.inZoneRequirements,
                                                      requirements: [createDefaultZoneAmountRequirement(), ...row.player.inZoneRequirements.requirements],
                                                    },
                                                  }
                                                  : row.player,
                                              }
                                              : row),
                                        }))}
                                    >
                                      Add Player Requirement
                                    </AppButton>
                                  </div>

                                  {contextRule.player.inZoneRequirements.requirements.map((requirement, requirementIndex) => (
                                    <div key={`player-requirement-${requirementIndex}`} className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/20 bg-[var(--surface)] p-2">
                                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                                        <CountConstraintField
                                          className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
                                          mode={requirement.comparison as ICountConstraintMode}
                                          value={requirement.amount}
                                          onModeChange={(selectedMode) =>
                                            updateEffectAt(effectIndex, (current) => ({
                                              ...current,
                                              contextRules: current.contextRules.map((row, index) =>
                                                index === contextRuleIndex
                                                  ? {
                                                    ...row,
                                                    player: row.player?.inZoneRequirements
                                                      ? {
                                                        ...row.player,
                                                        inZoneRequirements: {
                                                          ...row.player.inZoneRequirements,
                                                          requirements: row.player.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                            entryIndex === requirementIndex
                                                              ? { ...entry, comparison: selectedMode }
                                                              : entry),
                                                        },
                                                      }
                                                      : row.player,
                                                  }
                                                  : row),
                                            }))}
                                          onValueChange={(parsedValue) =>
                                            updateEffectAt(effectIndex, (current) => ({
                                              ...current,
                                              contextRules: current.contextRules.map((row, index) =>
                                                index === contextRuleIndex
                                                  ? {
                                                    ...row,
                                                    player: row.player?.inZoneRequirements
                                                      ? {
                                                        ...row.player,
                                                        inZoneRequirements: {
                                                          ...row.player.inZoneRequirements,
                                                          requirements: row.player.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                            entryIndex === requirementIndex
                                                              ? { ...entry, amount: parsedValue ?? 0 }
                                                              : entry),
                                                        },
                                                      }
                                                      : row.player,
                                                  }
                                                  : row),
                                            }))}
                                        />

                                        <select
                                          value={requirement.restriction.matchMode}
                                          onChange={(event) =>
                                            updateEffectAt(effectIndex, (current) => ({
                                              ...current,
                                              contextRules: current.contextRules.map((row, index) =>
                                                index === contextRuleIndex
                                                  ? {
                                                    ...row,
                                                    player: row.player?.inZoneRequirements
                                                      ? {
                                                        ...row.player,
                                                        inZoneRequirements: {
                                                          ...row.player.inZoneRequirements,
                                                          requirements: row.player.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                            entryIndex === requirementIndex
                                                              ? {
                                                                ...entry,
                                                                restriction: {
                                                                  ...entry.restriction,
                                                                  matchMode: event.target.value,
                                                                },
                                                              }
                                                              : entry),
                                                        },
                                                      }
                                                      : row.player,
                                                  }
                                                  : row),
                                            }))}
                                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        >
                                          {MATCH_MODE_OPTIONS.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                          ))}
                                        </select>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateEffectAt(effectIndex, (current) => ({
                                              ...current,
                                              contextRules: current.contextRules.map((row, index) =>
                                                index === contextRuleIndex
                                                  ? {
                                                    ...row,
                                                    player: row.player?.inZoneRequirements
                                                      ? {
                                                        ...row.player,
                                                        inZoneRequirements: {
                                                          ...row.player.inZoneRequirements,
                                                          requirements: row.player.inZoneRequirements.requirements.filter((_, entryIndex) => entryIndex !== requirementIndex),
                                                        },
                                                      }
                                                      : row.player,
                                                  }
                                                  : row),
                                            }))}
                                          className="inline-flex w-fit justify-self-end self-center px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                          aria-label="Remove Requirement"
                                        >
                                          X
                                        </button>
                                      </div>

                                      <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/20 bg-[var(--surface-muted)] p-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs font-semibold text-[var(--text-secondary)]">Predicates</p>
                                          <AppButton
                                            type="button"
                                            variant="ghost"
                                            onClick={() =>
                                              updateEffectAt(effectIndex, (current) => ({
                                                ...current,
                                                contextRules: current.contextRules.map((row, index) =>
                                                  index === contextRuleIndex
                                                    ? {
                                                      ...row,
                                                      player: row.player?.inZoneRequirements
                                                        ? {
                                                          ...row.player,
                                                          inZoneRequirements: {
                                                            ...row.player.inZoneRequirements,
                                                            requirements: row.player.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                              entryIndex === requirementIndex
                                                                ? {
                                                                  ...entry,
                                                                  restriction: {
                                                                    ...entry.restriction,
                                                                    predicates: [createDefaultPredicate(), ...entry.restriction.predicates],
                                                                  },
                                                                }
                                                                : entry),
                                                          },
                                                        }
                                                        : row.player,
                                                    }
                                                    : row),
                                              }))}
                                          >
                                            Add Predicate
                                          </AppButton>
                                        </div>

                                        {requirement.restriction.predicates.map((predicate, predicateIndex) => {
                                          const predicateEntries = getPredicateEntries(predicate)

                                          return (
                                          <div key={`player-requirement-predicate-${predicateIndex}`} className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/15 bg-[var(--surface)] p-2">
                                            <div className="flex flex-wrap items-start gap-2">
                                            <select
                                              value={predicate.property}
                                              onChange={(event) =>
                                                updateEffectAt(effectIndex, (current) => ({
                                                  ...current,
                                                  contextRules: current.contextRules.map((row, index) =>
                                                    index === contextRuleIndex
                                                      ? {
                                                        ...row,
                                                        player: row.player?.inZoneRequirements
                                                          ? {
                                                            ...row.player,
                                                            inZoneRequirements: {
                                                              ...row.player.inZoneRequirements,
                                                              requirements: row.player.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                                entryIndex === requirementIndex
                                                                  ? {
                                                                    ...entry,
                                                                    restriction: {
                                                                      ...entry.restriction,
                                                                      predicates: entry.restriction.predicates.map((rowPredicate, rowPredicateIndex) =>
                                                                        rowPredicateIndex === predicateIndex
                                                                          ? { ...rowPredicate, property: event.target.value as ICardCatalogPredicateProperty }
                                                                          : rowPredicate),
                                                                    },
                                                                  }
                                                                  : entry),
                                                            },
                                                          }
                                                          : row.player,
                                                      }
                                                      : row),
                                                }))}
                                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto sm:min-w-[11rem]"
                                            >
                                              {PREDICATE_PROPERTY_OPTIONS.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                              ))}
                                            </select>

                                            <select
                                              value={predicate.operator}
                                              onChange={(event) =>
                                                updateEffectAt(effectIndex, (current) => ({
                                                  ...current,
                                                  contextRules: current.contextRules.map((row, index) =>
                                                    index === contextRuleIndex
                                                      ? {
                                                        ...row,
                                                        player: row.player?.inZoneRequirements
                                                          ? {
                                                            ...row.player,
                                                            inZoneRequirements: {
                                                              ...row.player.inZoneRequirements,
                                                              requirements: row.player.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                                entryIndex === requirementIndex
                                                                  ? {
                                                                    ...entry,
                                                                    restriction: {
                                                                      ...entry.restriction,
                                                                      predicates: entry.restriction.predicates.map((rowPredicate, rowPredicateIndex) =>
                                                                        rowPredicateIndex === predicateIndex
                                                                          ? { ...rowPredicate, operator: event.target.value }
                                                                          : rowPredicate),
                                                                    },
                                                                  }
                                                                  : entry),
                                                            },
                                                          }
                                                          : row.player,
                                                      }
                                                      : row),
                                                }))}
                                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto sm:min-w-[10rem]"
                                            >
                                              {PREDICATE_OPERATOR_OPTIONS.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                              ))}
                                            </select>

                                            <div className="min-w-[14rem] flex-1">
                                              <input
                                                type="text"
                                                placeholder={
                                                  predicateEntries.length > 0
                                                    ? `Add value (current: ${predicateEntries.join(', ')})`
                                                    : 'Add value and press Enter'
                                                }
                                                onKeyDown={(event) => {
                                                  if (event.key !== 'Enter') {
                                                    return
                                                  }

                                                  event.preventDefault()
                                                  const inputValue = event.currentTarget.value

                                                  updateEffectAt(effectIndex, (current) => ({
                                                    ...current,
                                                    contextRules: current.contextRules.map((row, index) =>
                                                      index === contextRuleIndex
                                                        ? {
                                                          ...row,
                                                          player: row.player?.inZoneRequirements
                                                            ? {
                                                              ...row.player,
                                                              inZoneRequirements: {
                                                                ...row.player.inZoneRequirements,
                                                                requirements: row.player.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                                  entryIndex === requirementIndex
                                                                    ? {
                                                                      ...entry,
                                                                      restriction: {
                                                                        ...entry.restriction,
                                                                        predicates: entry.restriction.predicates.map((rowPredicate, rowPredicateIndex) =>
                                                                          rowPredicateIndex === predicateIndex
                                                                            ? appendPredicateEntries(rowPredicate, inputValue)
                                                                            : rowPredicate),
                                                                      },
                                                                    }
                                                                    : entry),
                                                              },
                                                            }
                                                            : row.player,
                                                        }
                                                        : row),
                                                  }))

                                                  event.currentTarget.value = ''
                                                }}
                                                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                              />
                                            </div>
                                            </div>

                                            {predicateEntries.length > 0 ? (
                                              <div className="w-full flex flex-wrap gap-2">
                                                {predicateEntries.map((entry, entryIndex) => (
                                                  <div
                                                    key={`${entry}-${entryIndex}`}
                                                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                                                  >
                                                    <span>{entry}</span>
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        updateEffectAt(effectIndex, (current) => ({
                                                          ...current,
                                                          contextRules: current.contextRules.map((row, index) =>
                                                            index === contextRuleIndex
                                                              ? {
                                                                ...row,
                                                                player: row.player?.inZoneRequirements
                                                                  ? {
                                                                    ...row.player,
                                                                    inZoneRequirements: {
                                                                      ...row.player.inZoneRequirements,
                                                                      requirements: row.player.inZoneRequirements.requirements.map((requirementEntry, requirementEntryIndex) =>
                                                                        requirementEntryIndex === requirementIndex
                                                                          ? {
                                                                            ...requirementEntry,
                                                                            restriction: {
                                                                              ...requirementEntry.restriction,
                                                                              predicates: requirementEntry.restriction.predicates.map((rowPredicate, rowPredicateIndex) =>
                                                                                rowPredicateIndex === predicateIndex
                                                                                  ? removePredicateEntryAt(rowPredicate, entryIndex)
                                                                                  : rowPredicate),
                                                                            },
                                                                          }
                                                                          : requirementEntry),
                                                                    },
                                                                  }
                                                                  : row.player,
                                                              }
                                                              : row),
                                                        }))
                                                      }
                                                      className="rounded-full px-1 leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                                                      aria-label={`Remove ${entry}`}
                                                    >
                                                      X
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : null}

                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                              <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
                                                <span>Ignore Case</span>
                                                <span className="relative inline-flex h-5 w-9 items-center">
                                                  <input
                                                    type="checkbox"
                                                    checked={predicate.ignoreCase}
                                                    onChange={(event) =>
                                                      updateEffectAt(effectIndex, (current) => ({
                                                        ...current,
                                                        contextRules: current.contextRules.map((row, index) =>
                                                          index === contextRuleIndex
                                                            ? {
                                                              ...row,
                                                              player: row.player?.inZoneRequirements
                                                                ? {
                                                                  ...row.player,
                                                                  inZoneRequirements: {
                                                                    ...row.player.inZoneRequirements,
                                                                    requirements: row.player.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                                      entryIndex === requirementIndex
                                                                        ? {
                                                                          ...entry,
                                                                          restriction: {
                                                                            ...entry.restriction,
                                                                            predicates: entry.restriction.predicates.map((rowPredicate, rowPredicateIndex) =>
                                                                              rowPredicateIndex === predicateIndex
                                                                                ? { ...rowPredicate, ignoreCase: event.target.checked }
                                                                                : rowPredicate),
                                                                          },
                                                                        }
                                                                        : entry),
                                                                  },
                                                                }
                                                                : row.player,
                                                            }
                                                            : row),
                                                      }))}
                                                    className="peer sr-only"
                                                  />
                                                  <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-cyan-500/70" />
                                                  <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                                                </span>
                                              </label>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  updateEffectAt(effectIndex, (current) => ({
                                                    ...current,
                                                    contextRules: current.contextRules.map((row, index) =>
                                                      index === contextRuleIndex
                                                        ? {
                                                          ...row,
                                                          player: row.player?.inZoneRequirements
                                                            ? {
                                                              ...row.player,
                                                              inZoneRequirements: {
                                                                ...row.player.inZoneRequirements,
                                                                requirements: row.player.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                                  entryIndex === requirementIndex
                                                                    ? {
                                                                      ...entry,
                                                                      restriction: {
                                                                        ...entry.restriction,
                                                                        predicates: entry.restriction.predicates.filter((_, rowPredicateIndex) => rowPredicateIndex !== predicateIndex),
                                                                      },
                                                                    }
                                                                    : entry),
                                                              },
                                                            }
                                                            : row.player,
                                                        }
                                                        : row),
                                                  }))}
                                                className="self-end px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                                aria-label="Remove Predicate"
                                              >
                                                X
                                              </button>
                                            </div>
                                          </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>

                        <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/30 bg-[var(--surface)] p-3">
                          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                            <input
                              type="checkbox"
                              checked={contextRule.opponent !== null}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  contextRules: current.contextRules.map((row, index) =>
                                    index === contextRuleIndex
                                      ? {
                                        ...row,
                                        opponent: event.target.checked ? { inZone: null, inZoneRequirements: null } : null,
                                      }
                                      : row),
                                }))}
                            />
                            Opponent Condition Enabled
                          </label>

                          {contextRule.opponent ? (
                            <>
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Opponent In Zone</label>
                                <select
                                  value={contextRule.opponent.inZone ?? ''}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      contextRules: current.contextRules.map((row, index) =>
                                        index === contextRuleIndex
                                          ? {
                                            ...row,
                                            opponent: row.opponent
                                              ? { ...row.opponent, inZone: event.target.value || null }
                                              : row.opponent,
                                          }
                                          : row),
                                    }))}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                >
                                  <option value="">None</option>
                                  {PLAYER_ZONE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>

                              <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                                <input
                                  type="checkbox"
                                  checked={contextRule.opponent.inZoneRequirements !== null}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      contextRules: current.contextRules.map((row, index) =>
                                        index === contextRuleIndex
                                          ? {
                                            ...row,
                                            opponent: row.opponent
                                              ? {
                                                ...row.opponent,
                                                inZoneRequirements: event.target.checked ? createDefaultZoneRequirementSet() : null,
                                              }
                                              : row.opponent,
                                          }
                                          : row),
                                    }))}
                                />
                                Opponent In-Zone Requirements Enabled
                              </label>

                              {contextRule.opponent.inZoneRequirements ? (
                                <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/25 bg-[var(--surface-muted)] p-2">
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Requirement Operator</label>
                                      <select
                                        value={contextRule.opponent.inZoneRequirements.operator}
                                        onChange={(event) =>
                                          updateEffectAt(effectIndex, (current) => ({
                                            ...current,
                                            contextRules: current.contextRules.map((row, index) =>
                                              index === contextRuleIndex
                                                ? {
                                                  ...row,
                                                  opponent: row.opponent?.inZoneRequirements
                                                    ? {
                                                      ...row.opponent,
                                                      inZoneRequirements: {
                                                        ...row.opponent.inZoneRequirements,
                                                        operator: event.target.value,
                                                      },
                                                    }
                                                    : row.opponent,
                                                }
                                                : row),
                                          }))}
                                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                      >
                                        {RULE_OPERATOR_OPTIONS.map((option) => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </div>

                                    <label className="inline-flex h-10 self-end items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]">
                                      <span>Distinct Cards Across Requirements</span>
                                      <span className="relative inline-flex h-5 w-9 items-center">
                                        <input
                                          type="checkbox"
                                          checked={contextRule.opponent.inZoneRequirements.distinctCardsAcrossRequirements}
                                          onChange={(event) =>
                                            updateEffectAt(effectIndex, (current) => ({
                                              ...current,
                                              contextRules: current.contextRules.map((row, index) =>
                                                index === contextRuleIndex
                                                  ? {
                                                    ...row,
                                                    opponent: row.opponent?.inZoneRequirements
                                                      ? {
                                                        ...row.opponent,
                                                        inZoneRequirements: {
                                                          ...row.opponent.inZoneRequirements,
                                                          distinctCardsAcrossRequirements: event.target.checked,
                                                        },
                                                      }
                                                      : row.opponent,
                                                  }
                                                  : row),
                                            }))}
                                          className="peer sr-only"
                                        />
                                        <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-cyan-500/70" />
                                        <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                                      </span>
                                    </label>
                                  </div>

                                  <div className="flex justify-end">
                                    <AppButton
                                      type="button"
                                      variant="ghost"
                                      onClick={() =>
                                        updateEffectAt(effectIndex, (current) => ({
                                          ...current,
                                          contextRules: current.contextRules.map((row, index) =>
                                            index === contextRuleIndex
                                              ? {
                                                ...row,
                                                opponent: row.opponent?.inZoneRequirements
                                                  ? {
                                                    ...row.opponent,
                                                    inZoneRequirements: {
                                                      ...row.opponent.inZoneRequirements,
                                                      requirements: [createDefaultZoneAmountRequirement(), ...row.opponent.inZoneRequirements.requirements],
                                                    },
                                                  }
                                                  : row.opponent,
                                              }
                                              : row),
                                        }))}
                                    >
                                      Add Opponent Requirement
                                    </AppButton>
                                  </div>

                                  {contextRule.opponent.inZoneRequirements.requirements.map((requirement, requirementIndex) => (
                                    <div key={`opponent-requirement-${requirementIndex}`} className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/20 bg-[var(--surface)] p-2">
                                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                                        <CountConstraintField
                                          className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
                                          mode={requirement.comparison as ICountConstraintMode}
                                          value={requirement.amount}
                                          onModeChange={(selectedMode) =>
                                            updateEffectAt(effectIndex, (current) => ({
                                              ...current,
                                              contextRules: current.contextRules.map((row, index) =>
                                                index === contextRuleIndex
                                                  ? {
                                                    ...row,
                                                    opponent: row.opponent?.inZoneRequirements
                                                      ? {
                                                        ...row.opponent,
                                                        inZoneRequirements: {
                                                          ...row.opponent.inZoneRequirements,
                                                          requirements: row.opponent.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                            entryIndex === requirementIndex
                                                              ? { ...entry, comparison: selectedMode }
                                                              : entry),
                                                        },
                                                      }
                                                      : row.opponent,
                                                  }
                                                  : row),
                                            }))}
                                          onValueChange={(parsedValue) =>
                                            updateEffectAt(effectIndex, (current) => ({
                                              ...current,
                                              contextRules: current.contextRules.map((row, index) =>
                                                index === contextRuleIndex
                                                  ? {
                                                    ...row,
                                                    opponent: row.opponent?.inZoneRequirements
                                                      ? {
                                                        ...row.opponent,
                                                        inZoneRequirements: {
                                                          ...row.opponent.inZoneRequirements,
                                                          requirements: row.opponent.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                            entryIndex === requirementIndex
                                                              ? { ...entry, amount: parsedValue ?? 0 }
                                                              : entry),
                                                        },
                                                      }
                                                      : row.opponent,
                                                  }
                                                  : row),
                                            }))}
                                        />

                                        <select
                                          value={requirement.restriction.matchMode}
                                          onChange={(event) =>
                                            updateEffectAt(effectIndex, (current) => ({
                                              ...current,
                                              contextRules: current.contextRules.map((row, index) =>
                                                index === contextRuleIndex
                                                  ? {
                                                    ...row,
                                                    opponent: row.opponent?.inZoneRequirements
                                                      ? {
                                                        ...row.opponent,
                                                        inZoneRequirements: {
                                                          ...row.opponent.inZoneRequirements,
                                                          requirements: row.opponent.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                            entryIndex === requirementIndex
                                                              ? {
                                                                ...entry,
                                                                restriction: {
                                                                  ...entry.restriction,
                                                                  matchMode: event.target.value,
                                                                },
                                                              }
                                                              : entry),
                                                        },
                                                      }
                                                      : row.opponent,
                                                  }
                                                  : row),
                                            }))}
                                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        >
                                          {MATCH_MODE_OPTIONS.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                          ))}
                                        </select>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateEffectAt(effectIndex, (current) => ({
                                              ...current,
                                              contextRules: current.contextRules.map((row, index) =>
                                                index === contextRuleIndex
                                                  ? {
                                                    ...row,
                                                    opponent: row.opponent?.inZoneRequirements
                                                      ? {
                                                        ...row.opponent,
                                                        inZoneRequirements: {
                                                          ...row.opponent.inZoneRequirements,
                                                          requirements: row.opponent.inZoneRequirements.requirements.filter((_, entryIndex) => entryIndex !== requirementIndex),
                                                        },
                                                      }
                                                      : row.opponent,
                                                  }
                                                  : row),
                                            }))}
                                          className="inline-flex w-fit justify-self-end self-center px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                          aria-label="Remove Requirement"
                                        >
                                          X
                                        </button>
                                      </div>

                                      <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/20 bg-[var(--surface-muted)] p-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="text-xs font-semibold text-[var(--text-secondary)]">Predicates</p>
                                          <AppButton
                                            type="button"
                                            variant="ghost"
                                            onClick={() =>
                                              updateEffectAt(effectIndex, (current) => ({
                                                ...current,
                                                contextRules: current.contextRules.map((row, index) =>
                                                  index === contextRuleIndex
                                                    ? {
                                                      ...row,
                                                      opponent: row.opponent?.inZoneRequirements
                                                        ? {
                                                          ...row.opponent,
                                                          inZoneRequirements: {
                                                            ...row.opponent.inZoneRequirements,
                                                            requirements: row.opponent.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                              entryIndex === requirementIndex
                                                                ? {
                                                                  ...entry,
                                                                  restriction: {
                                                                    ...entry.restriction,
                                                                    predicates: [createDefaultPredicate(), ...entry.restriction.predicates],
                                                                  },
                                                                }
                                                                : entry),
                                                          },
                                                        }
                                                        : row.opponent,
                                                    }
                                                    : row),
                                              }))}
                                          >
                                            Add Predicate
                                          </AppButton>
                                        </div>

                                        {requirement.restriction.predicates.map((predicate, predicateIndex) => {
                                          const predicateEntries = getPredicateEntries(predicate)

                                          return (
                                          <div key={`opponent-requirement-predicate-${predicateIndex}`} className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/15 bg-[var(--surface)] p-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                            <select
                                              value={predicate.property}
                                              onChange={(event) =>
                                                updateEffectAt(effectIndex, (current) => ({
                                                  ...current,
                                                  contextRules: current.contextRules.map((row, index) =>
                                                    index === contextRuleIndex
                                                      ? {
                                                        ...row,
                                                        opponent: row.opponent?.inZoneRequirements
                                                          ? {
                                                            ...row.opponent,
                                                            inZoneRequirements: {
                                                              ...row.opponent.inZoneRequirements,
                                                              requirements: row.opponent.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                                entryIndex === requirementIndex
                                                                  ? {
                                                                    ...entry,
                                                                    restriction: {
                                                                      ...entry.restriction,
                                                                      predicates: entry.restriction.predicates.map((rowPredicate, rowPredicateIndex) =>
                                                                        rowPredicateIndex === predicateIndex
                                                                          ? { ...rowPredicate, property: event.target.value as ICardCatalogPredicateProperty }
                                                                          : rowPredicate),
                                                                    },
                                                                  }
                                                                  : entry),
                                                            },
                                                          }
                                                          : row.opponent,
                                                      }
                                                      : row),
                                                }))}
                                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto sm:min-w-[11rem]"
                                            >
                                              {PREDICATE_PROPERTY_OPTIONS.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                              ))}
                                            </select>

                                            <select
                                              value={predicate.operator}
                                              onChange={(event) =>
                                                updateEffectAt(effectIndex, (current) => ({
                                                  ...current,
                                                  contextRules: current.contextRules.map((row, index) =>
                                                    index === contextRuleIndex
                                                      ? {
                                                        ...row,
                                                        opponent: row.opponent?.inZoneRequirements
                                                          ? {
                                                            ...row.opponent,
                                                            inZoneRequirements: {
                                                              ...row.opponent.inZoneRequirements,
                                                              requirements: row.opponent.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                                entryIndex === requirementIndex
                                                                  ? {
                                                                    ...entry,
                                                                    restriction: {
                                                                      ...entry.restriction,
                                                                      predicates: entry.restriction.predicates.map((rowPredicate, rowPredicateIndex) =>
                                                                        rowPredicateIndex === predicateIndex
                                                                          ? { ...rowPredicate, operator: event.target.value }
                                                                          : rowPredicate),
                                                                    },
                                                                  }
                                                                  : entry),
                                                            },
                                                          }
                                                          : row.opponent,
                                                      }
                                                      : row),
                                                }))}
                                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] sm:w-auto sm:min-w-[10rem]"
                                            >
                                              {PREDICATE_OPERATOR_OPTIONS.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                              ))}
                                            </select>

                                            <div className="min-w-[14rem] flex-1">
                                              <input
                                                type="text"
                                                placeholder={
                                                  predicateEntries.length > 0
                                                    ? `Add value (current: ${predicateEntries.join(', ')})`
                                                    : 'Add value and press Enter'
                                                }
                                                onKeyDown={(event) => {
                                                  if (event.key !== 'Enter') {
                                                    return
                                                  }

                                                  event.preventDefault()
                                                  const inputValue = event.currentTarget.value

                                                  updateEffectAt(effectIndex, (current) => ({
                                                    ...current,
                                                    contextRules: current.contextRules.map((row, index) =>
                                                      index === contextRuleIndex
                                                        ? {
                                                          ...row,
                                                          opponent: row.opponent?.inZoneRequirements
                                                            ? {
                                                              ...row.opponent,
                                                              inZoneRequirements: {
                                                                ...row.opponent.inZoneRequirements,
                                                                requirements: row.opponent.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                                  entryIndex === requirementIndex
                                                                    ? {
                                                                      ...entry,
                                                                      restriction: {
                                                                        ...entry.restriction,
                                                                        predicates: entry.restriction.predicates.map((rowPredicate, rowPredicateIndex) =>
                                                                          rowPredicateIndex === predicateIndex
                                                                            ? appendPredicateEntries(rowPredicate, inputValue)
                                                                            : rowPredicate),
                                                                      },
                                                                    }
                                                                    : entry),
                                                              },
                                                            }
                                                            : row.opponent,
                                                        }
                                                        : row),
                                                  }))

                                                  event.currentTarget.value = ''
                                                }}
                                                className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                              />
                                            </div>
                                            </div>

                                            {predicateEntries.length > 0 ? (
                                              <div className="w-full flex flex-wrap gap-2">
                                                {predicateEntries.map((entry, entryIndex) => (
                                                  <div
                                                    key={`${entry}-${entryIndex}`}
                                                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
                                                  >
                                                    <span>{entry}</span>
                                                    <button
                                                      type="button"
                                                      onClick={() =>
                                                        updateEffectAt(effectIndex, (current) => ({
                                                          ...current,
                                                          contextRules: current.contextRules.map((row, index) =>
                                                            index === contextRuleIndex
                                                              ? {
                                                                ...row,
                                                                opponent: row.opponent?.inZoneRequirements
                                                                  ? {
                                                                    ...row.opponent,
                                                                    inZoneRequirements: {
                                                                      ...row.opponent.inZoneRequirements,
                                                                      requirements: row.opponent.inZoneRequirements.requirements.map((requirementEntry, requirementEntryIndex) =>
                                                                        requirementEntryIndex === requirementIndex
                                                                          ? {
                                                                            ...requirementEntry,
                                                                            restriction: {
                                                                              ...requirementEntry.restriction,
                                                                              predicates: requirementEntry.restriction.predicates.map((rowPredicate, rowPredicateIndex) =>
                                                                                rowPredicateIndex === predicateIndex
                                                                                  ? removePredicateEntryAt(rowPredicate, entryIndex)
                                                                                  : rowPredicate),
                                                                            },
                                                                          }
                                                                          : requirementEntry),
                                                                    },
                                                                  }
                                                                  : row.opponent,
                                                              }
                                                              : row),
                                                        }))
                                                      }
                                                      className="rounded-full px-1 leading-none text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                                                      aria-label={`Remove ${entry}`}
                                                    >
                                                      X
                                                    </button>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : null}

                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                              <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">
                                                <span>Ignore Case</span>
                                                <span className="relative inline-flex h-5 w-9 items-center">
                                                  <input
                                                    type="checkbox"
                                                    checked={predicate.ignoreCase}
                                                    onChange={(event) =>
                                                      updateEffectAt(effectIndex, (current) => ({
                                                        ...current,
                                                        contextRules: current.contextRules.map((row, index) =>
                                                          index === contextRuleIndex
                                                            ? {
                                                              ...row,
                                                              opponent: row.opponent?.inZoneRequirements
                                                                ? {
                                                                  ...row.opponent,
                                                                  inZoneRequirements: {
                                                                    ...row.opponent.inZoneRequirements,
                                                                    requirements: row.opponent.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                                      entryIndex === requirementIndex
                                                                        ? {
                                                                          ...entry,
                                                                          restriction: {
                                                                            ...entry.restriction,
                                                                            predicates: entry.restriction.predicates.map((rowPredicate, rowPredicateIndex) =>
                                                                              rowPredicateIndex === predicateIndex
                                                                                ? { ...rowPredicate, ignoreCase: event.target.checked }
                                                                                : rowPredicate),
                                                                          },
                                                                        }
                                                                        : entry),
                                                                  },
                                                                }
                                                                : row.opponent,
                                                            }
                                                            : row),
                                                      }))}
                                                    className="peer sr-only"
                                                  />
                                                  <span className="absolute inset-0 rounded-full bg-[var(--surface)] transition peer-checked:bg-cyan-500/70" />
                                                  <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition peer-checked:translate-x-4" />
                                                </span>
                                              </label>
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  updateEffectAt(effectIndex, (current) => ({
                                                    ...current,
                                                    contextRules: current.contextRules.map((row, index) =>
                                                      index === contextRuleIndex
                                                        ? {
                                                          ...row,
                                                          opponent: row.opponent?.inZoneRequirements
                                                            ? {
                                                              ...row.opponent,
                                                              inZoneRequirements: {
                                                                ...row.opponent.inZoneRequirements,
                                                                requirements: row.opponent.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                                                  entryIndex === requirementIndex
                                                                    ? {
                                                                      ...entry,
                                                                      restriction: {
                                                                        ...entry.restriction,
                                                                        predicates: entry.restriction.predicates.filter((_, rowPredicateIndex) => rowPredicateIndex !== predicateIndex),
                                                                      },
                                                                    }
                                                                    : entry),
                                                              },
                                                            }
                                                            : row.opponent,
                                                        }
                                                        : row),
                                                  }))}
                                                className="self-end px-1 text-sm leading-none text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                                aria-label="Remove Predicate"
                                              >
                                                X
                                              </button>
                                            </div>
                                          </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {effect.runtimeEffectType === 'Change Values' ? (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-rose-500/50 bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Attribute Modifications</p>

                    <div className="flex justify-end">
                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            attributeModifications: [...current.attributeModifications, createDefaultAttributeModification()],
                          }))}
                      >
                        Add Attribute Modification
                      </AppButton>
                    </div>

                    {effect.attributeModifications.map((attributeModification, attributeIndex) => (
                      <div key={`attribute-mod-${attributeIndex}`} className="space-y-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-rose-500/30 bg-[var(--surface)] p-3">
                        <div className="flex justify-end">
                          <AppButton
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                attributeModifications: current.attributeModifications.filter((_, index) => index !== attributeIndex),
                              }))}
                          >
                            Remove
                          </AppButton>
                        </div>

                        <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-4 sm:gap-x-2">
                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Type</label>
                            <select
                              value={attributeModification.targetType}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  attributeModifications: current.attributeModifications.map((row, index) =>
                                    index === attributeIndex ? { ...row, targetType: event.target.value } : row),
                                }))}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              {TARGET_TYPE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Range</label>
                            <select
                              value={attributeModification.targetRange}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  attributeModifications: current.attributeModifications.map((row, index) =>
                                    index === attributeIndex ? { ...row, targetRange: event.target.value } : row),
                                }))}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              {TARGET_RANGE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1 sm:col-span-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Affected Property</label>
                            <select
                              value={attributeModification.attribute}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  attributeModifications: current.attributeModifications.map((row, index) =>
                                    index === attributeIndex ? { ...row, attribute: event.target.value } : row),
                                }))}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              {ATTRIBUTE_TYPE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>

                          <CountConstraintField
                            className="sm:col-span-4 grid grid-cols-1 gap-2 sm:grid-cols-4"
                            selectClassName="w-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            inputClassName="w-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            modeLabel="Value Mode"
                            valueLabel="Value"
                            placeholder="Value"
                            mode={resolveAttributeValueConstraintMode(
                              attributeModification.minimumValue,
                              attributeModification.maximumValue,
                            )}
                            value={resolveCountConstraintValue(
                              resolveAttributeValueConstraintMode(
                                attributeModification.minimumValue,
                                attributeModification.maximumValue,
                              ),
                              attributeModification.value,
                              attributeModification.minimumValue,
                              attributeModification.maximumValue,
                            )}
                            trailingContent={(
                              <div className="space-y-1">
                                <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Operation</label>
                                <select
                                  value={attributeModification.operation}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      attributeModifications: current.attributeModifications.map((row, index) =>
                                        index === attributeIndex ? { ...row, operation: event.target.value } : row),
                                    }))}
                                  className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                >
                                  {ATTRIBUTE_OPERATION_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            onModeChange={(selectedMode) =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                attributeModifications: current.attributeModifications.map((row, index) => {
                                  if (index !== attributeIndex) {
                                    return row
                                  }

                                  if (selectedMode === 'Exact') {
                                    return {
                                      ...row,
                                      minimumValue: null,
                                      maximumValue: null,
                                    }
                                  }

                                  const seedValue = row.minimumValue ?? row.maximumValue ?? row.value

                                  return {
                                    ...row,
                                    minimumValue: selectedMode === 'Minimum' ? seedValue : null,
                                    maximumValue: selectedMode === 'Maximum' ? seedValue : null,
                                  }
                                }),
                              }))}
                            onValueChange={(parsedValue) =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                attributeModifications: current.attributeModifications.map((row, index) => {
                                  if (index !== attributeIndex) {
                                    return row
                                  }

                                  const selectedMode = resolveAttributeValueConstraintMode(
                                    row.minimumValue,
                                    row.maximumValue,
                                  )

                                  if (selectedMode === 'Exact') {
                                    return {
                                      ...row,
                                      value: parsedValue ?? 0,
                                      minimumValue: null,
                                      maximumValue: null,
                                    }
                                  }

                                  return {
                                    ...row,
                                    minimumValue: selectedMode === 'Minimum' ? parsedValue : null,
                                    maximumValue: selectedMode === 'Maximum' ? parsedValue : null,
                                  }
                                }),
                              }))}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {effect.runtimeEffectType === 'Alter Resources' ? (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-lime-500/55 bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Chakra Adjustments</p>

                    <div className="flex justify-end">
                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            chakraAdjustments: [...current.chakraAdjustments, createDefaultChakraAdjustment()],
                          }))}
                      >
                        Add Chakra Adjustment
                      </AppButton>
                    </div>

                    {effect.chakraAdjustments.map((chakraAdjustment, chakraIndex) => (
                      <div key={`chakra-adjustment-${chakraIndex}`} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-lime-500/30 bg-[var(--surface)] p-3 sm:grid-cols-4">
                      <select
                        value={chakraAdjustment.targetRange}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            chakraAdjustments: current.chakraAdjustments.map((row, index) =>
                              index === chakraIndex ? { ...row, targetRange: event.target.value } : row),
                          }))}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      >
                        {TARGET_RANGE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>

                      <select
                        value={chakraAdjustment.operation}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            chakraAdjustments: current.chakraAdjustments.map((row, index) =>
                              index === chakraIndex ? { ...row, operation: event.target.value } : row),
                          }))}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      >
                        {CHAKRA_OPERATION_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        value={chakraAdjustment.amount}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            chakraAdjustments: current.chakraAdjustments.map((row, index) =>
                              index === chakraIndex ? { ...row, amount: Number.parseInt(event.target.value || '0', 10) } : row),
                          }))}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />

                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            chakraAdjustments: current.chakraAdjustments.filter((_, index) => index !== chakraIndex),
                          }))}
                      >
                        Remove
                      </AppButton>
                      </div>
                    ))}
                  </div>
                ) : null}

                {effect.runtimeEffectType === 'Alter Resources' ? (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-indigo-500/55 bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Face State Flips</p>

                    <div className="flex justify-end">
                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            summonCardFlips: [...current.summonCardFlips, createDefaultSummonCardFlip()],
                          }))}
                      >
                        Add Face State Flip
                      </AppButton>
                    </div>

                    {effect.summonCardFlips.map((summonCardFlip, summonFlipIndex) => (
                      <div key={`summon-flip-${summonFlipIndex}`} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-indigo-500/30 bg-[var(--surface)] p-3 sm:grid-cols-4">
                      <select
                        value={summonCardFlip.targetCategory}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            summonCardFlips: current.summonCardFlips.map((row, index) =>
                              index === summonFlipIndex ? { ...row, targetCategory: event.target.value } : row),
                          }))}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      >
                        {FACE_STATE_TARGET_CATEGORY_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>

                      <select
                        value={summonCardFlip.targetRange}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            summonCardFlips: current.summonCardFlips.map((row, index) =>
                              index === summonFlipIndex ? { ...row, targetRange: event.target.value } : row),
                          }))}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      >
                        {TARGET_RANGE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>

                      <select
                        value={summonCardFlip.faceState}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            summonCardFlips: current.summonCardFlips.map((row, index) =>
                              index === summonFlipIndex ? { ...row, faceState: event.target.value } : row),
                          }))}
                        className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      >
                        {FACE_STATE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>

                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            summonCardFlips: current.summonCardFlips.filter((_, index) => index !== summonFlipIndex),
                          }))}
                      >
                        Remove
                      </AppButton>
                      </div>
                    ))}
                  </div>
                ) : null}

                {effect.runtimeEffectType === 'Alter Resources' ? (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-violet-500/55 bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Face State Locks</p>

                    <div className="flex justify-end">
                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            faceStateLocks: [...current.faceStateLocks, createDefaultFaceStateLock()],
                          }))}
                      >
                        Add Face State Lock
                      </AppButton>
                    </div>

                    {effect.faceStateLocks.map((faceStateLock, faceStateLockIndex) => (
                      <div key={`face-lock-${faceStateLockIndex}`} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-violet-500/30 bg-[var(--surface)] p-3 sm:grid-cols-4">
                        <select
                          value={faceStateLock.targetCategory}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              faceStateLocks: current.faceStateLocks.map((row, index) =>
                                index === faceStateLockIndex ? { ...row, targetCategory: event.target.value } : row),
                            }))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        >
                            {FACE_STATE_TARGET_CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>

                        <select
                          value={faceStateLock.operation}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              faceStateLocks: current.faceStateLocks.map((row, index) =>
                                index === faceStateLockIndex ? { ...row, operation: event.target.value } : row),
                            }))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        >
                          {FACE_STATE_LOCK_OPERATION_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>

                        <select
                          value={faceStateLock.targetRange}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              faceStateLocks: current.faceStateLocks.map((row, index) =>
                                index === faceStateLockIndex ? { ...row, targetRange: event.target.value } : row),
                            }))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        >
                          {TARGET_RANGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>

                        <AppButton
                          type="button"
                          variant="ghost"
                          onClick={() =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              faceStateLocks: current.faceStateLocks.filter((_, index) => index !== faceStateLockIndex),
                            }))}
                        >
                          Remove
                        </AppButton>
                      </div>
                    ))}
                  </div>
                ) : null}

                {effect.runtimeEffectType === 'Move Card' ? (
                  <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-cyan-500/55 bg-[var(--surface-muted)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Move Card Actions</p>

                    <div className="flex justify-end">
                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            moveCardActions: [...current.moveCardActions, createDefaultMoveCardAction()],
                          }))}
                      >
                        Add Move Action
                      </AppButton>
                    </div>

                    {effect.moveCardActions.map((moveCardAction, moveCardActionIndex) => {
                      const isDrawAction = moveCardAction.operation === 'Draw'
                      const isDeckDestination = moveCardAction.destinationZone === 'Deck'
                      const isIndexPlacement = (moveCardAction.deckPlacement ?? 'Top') === 'Index'

                      return (
                        <div key={`move-card-action-${moveCardActionIndex}`} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/30 bg-[var(--surface)] p-3 sm:grid-cols-4">
                          <select
                            value={moveCardAction.operation}
                            onChange={(event) =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                moveCardActions: current.moveCardActions.map((row, index) => {
                                  if (index !== moveCardActionIndex) {
                                    return row
                                  }

                                  const nextOperation = event.target.value
                                  if (nextOperation === 'Draw') {
                                    return {
                                      ...row,
                                      operation: nextOperation,
                                      sourceZone: null,
                                      destinationZone: null,
                                      drawCount: row.drawCount ?? 1,
                                      moveCount: null,
                                      destinationIndex: null,
                                      deckPlacement: null,
                                      multiCardOrdering: null,
                                      destinationPlayerRange: 'Self',
                                      allowCrossPlayer: false,
                                    }
                                  }

                                  return {
                                    ...row,
                                    operation: nextOperation,
                                    sourceZone: row.sourceZone ?? 'Hand',
                                    destinationZone: row.destinationZone ?? 'Deck',
                                    drawCount: null,
                                    moveCount: row.moveCount ?? 1,
                                    destinationIndex: row.destinationIndex ?? 0,
                                    deckPlacement: row.deckPlacement ?? 'Top',
                                    multiCardOrdering: row.multiCardOrdering ?? 'Selected Order',
                                    destinationPlayerRange: row.destinationPlayerRange || 'Self',
                                  }
                                }),
                              }))}
                            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                          >
                            {MOVE_CARD_OPERATION_OPTIONS.map((option) => (
                              <option key={option} value={option}>{option}</option>
                            ))}
                          </select>

                          {!isDrawAction ? (
                            <select
                              value={moveCardAction.sourceZone ?? 'Hand'}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  moveCardActions: current.moveCardActions.map((row, index) =>
                                    index === moveCardActionIndex ? { ...row, sourceZone: event.target.value } : row),
                                }))}
                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              {MOVE_CARD_ZONE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="number"
                              min={1}
                              value={moveCardAction.drawCount ?? 1}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  moveCardActions: current.moveCardActions.map((row, index) =>
                                    index === moveCardActionIndex
                                      ? { ...row, drawCount: Number.parseInt(event.target.value || '1', 10) }
                                      : row),
                                }))}
                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                              placeholder="Draw count"
                            />
                          )}

                          {!isDrawAction ? (
                            <select
                              value={moveCardAction.destinationZone ?? 'Deck'}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  moveCardActions: current.moveCardActions.map((row, index) =>
                                    index === moveCardActionIndex
                                      ? {
                                        ...row,
                                        destinationZone: event.target.value,
                                        deckPlacement: event.target.value === 'Deck' ? (row.deckPlacement ?? 'Top') : null,
                                        multiCardOrdering: event.target.value === 'Deck' ? (row.multiCardOrdering ?? 'Selected Order') : null,
                                        destinationIndex:
                                          event.target.value === 'Deck'
                                            ? (row.destinationIndex ?? 0)
                                            : row.destinationIndex,
                                      }
                                      : row),
                                }))}
                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              {MOVE_CARD_ZONE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={moveCardAction.destinationPlayerRange}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  moveCardActions: current.moveCardActions.map((row, index) =>
                                    index === moveCardActionIndex
                                      ? { ...row, destinationPlayerRange: event.target.value }
                                      : row),
                                }))}
                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              {MOVE_CARD_DESTINATION_RANGE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          )}

                          <AppButton
                            type="button"
                            variant="ghost"
                            onClick={() =>
                              updateEffectAt(effectIndex, (current) => ({
                                ...current,
                                moveCardActions: current.moveCardActions.filter((_, index) => index !== moveCardActionIndex),
                              }))}
                          >
                            Remove
                          </AppButton>

                          {!isDrawAction ? (
                            <>
                              {isDeckDestination ? (
                                <select
                                  value={moveCardAction.deckPlacement ?? 'Top'}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      moveCardActions: current.moveCardActions.map((row, index) => {
                                        if (index !== moveCardActionIndex) {
                                          return row
                                        }

                                        const nextPlacement = event.target.value
                                        return {
                                          ...row,
                                          deckPlacement: nextPlacement,
                                          destinationIndex:
                                            nextPlacement === 'Index'
                                              ? (row.destinationIndex ?? 0)
                                              : row.destinationIndex,
                                        }
                                      }),
                                    }))}
                                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                >
                                  {MOVE_CARD_DECK_PLACEMENT_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              ) : null}

                              {isDeckDestination ? (
                                <select
                                  value={moveCardAction.multiCardOrdering ?? 'Selected Order'}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      moveCardActions: current.moveCardActions.map((row, index) =>
                                        index === moveCardActionIndex
                                          ? { ...row, multiCardOrdering: event.target.value }
                                          : row),
                                    }))}
                                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                >
                                  {MOVE_CARD_MULTI_ORDERING_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              ) : null}

                              {isDeckDestination && isIndexPlacement ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={moveCardAction.destinationIndex ?? 0}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      moveCardActions: current.moveCardActions.map((row, index) =>
                                        index === moveCardActionIndex
                                          ? { ...row, destinationIndex: parseNullableInteger(event.target.value) ?? 0 }
                                          : row),
                                    }))}
                                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                  placeholder="Destination index"
                                />
                              ) : null}

                              <input
                                type="number"
                                min={1}
                                value={moveCardAction.moveCount ?? 1}
                                onChange={(event) =>
                                  updateEffectAt(effectIndex, (current) => ({
                                    ...current,
                                    moveCardActions: current.moveCardActions.map((row, index) =>
                                      index === moveCardActionIndex
                                        ? { ...row, moveCount: Number.parseInt(event.target.value || '1', 10) }
                                        : row),
                                  }))}
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                placeholder="Move count"
                              />

                              <select
                                value={moveCardAction.destinationPlayerRange}
                                onChange={(event) =>
                                  updateEffectAt(effectIndex, (current) => ({
                                    ...current,
                                    moveCardActions: current.moveCardActions.map((row, index) =>
                                      index === moveCardActionIndex
                                        ? { ...row, destinationPlayerRange: event.target.value }
                                        : row),
                                  }))}
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                              >
                                {MOVE_CARD_DESTINATION_RANGE_OPTIONS.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>

                              <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)] sm:col-span-4">
                                <input
                                  type="checkbox"
                                  checked={moveCardAction.allowCrossPlayer}
                                  onChange={(event) =>
                                    updateEffectAt(effectIndex, (current) => ({
                                      ...current,
                                      moveCardActions: current.moveCardActions.map((row, index) =>
                                        index === moveCardActionIndex
                                          ? { ...row, allowCrossPlayer: event.target.checked }
                                          : row),
                                    }))}
                                />
                                Allow Cross Player Transfer
                              </label>
                            </>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
                  </>
                ) : null}
              </div>
            ))}

        </div>

        {editorModel.errors.effects ? (
          <p className="text-xs text-red-500">{editorModel.errors.effects}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <AppButton
          type="button"
          variant="ghost"
          onClick={editorModel.reset}
          disabled={!editorModel.isDirty || editorModel.isSaving}
        >
          Reset
        </AppButton>
      </div>

      {typeof document !== 'undefined'
        ? createPortal(
          <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
            {editorModel.isDirty ? (
              <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Unsaved Changes
              </span>
            ) : null}

            <AppButton
              type="button"
              onClick={async () => {
                if (!editorModel.isDirty) {
                  showAppInfoToast('No changes to save.', {
                    id: 'card-admin-save-status',
                    position: 'top-right',
                  })
                  return
                }

                const result = await editorModel.save()
                if (result.ok) {
                  showAppSuccessToast('Card saved successfully.', {
                    id: 'card-admin-save-status',
                    position: 'top-right',
                  })
                  return
                }

                showAppInfoToast(result.message ?? 'Failed to save card payload.', {
                  id: 'card-admin-save-status',
                  position: 'top-right',
                })
              }}
              disabled={isSaveDisabled}
              className="shadow-lg"
            >
              {editorModel.isSaving ? 'Saving...' : 'Save Card'}
            </AppButton>
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}
