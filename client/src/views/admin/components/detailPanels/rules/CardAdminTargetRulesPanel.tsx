import { AppButton } from '@/components/ui'
import { CardAdminToggleSwitch } from '@/views/admin/components/CardAdminToggleSwitch'
import { CountConstraintField } from '@/views/admin/components/CountConstraintField'
import {
  MATCH_MODE_OPTIONS,
  PREDICATE_OPERATOR_OPTIONS,
  PREDICATE_PROPERTY_OPTIONS,
  RULE_OPERATOR_OPTIONS,
  TARGET_LOCATION_SELECTOR_KIND_OPTIONS,
  TARGET_RANGE_OPTIONS,
  TRIBUTE_ROLE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminTargetRulesPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import type { ICardCatalogPredicateProperty } from '@/services/api/types/cardCatalog'
import {
  appendPredicateEntries,
  createDefaultPredicate,
  createDefaultTargetRule,
  getPredicateEntries,
  isAttackNegationRuntimeEffect,
  isSummonOrTributeRuntimeEffect,
  parseNullableInteger,
  removePredicateEntryAt,
  resolveCountConstraintMode,
  resolveCountConstraintSeedValue,
  resolveCountConstraintValue,
  resolveTargetZoneOptions,
} from '@/views/admin/utils'
import { CardAdminSelect } from '@/views/admin/components/CardAdminSelect'

export function CardAdminTargetRulesPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminTargetRulesPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-emerald-500/55 bg-[var(--surface-muted)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Rules</p>

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Rule Operator</label>
          <CardAdminSelect
            value={effect.targetRules.operator}
            onChange={(event) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                targetRules: { ...current.targetRules, operator: event.target.value },
              }))}
          >
            {RULE_OPERATOR_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </CardAdminSelect>
        </div>
      </div>

      {effect.runtimeEffectType === 'Tribute' ? (
        <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
          <CardAdminToggleSwitch
            checked={effect.targetRules.tributeComposition !== null}
            onChange={(checked) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                targetRules: {
                  ...current.targetRules,
                  tributeComposition: checked
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
            ariaLabel="Tribute Composition Enabled"
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
            <CardAdminToggleSwitch
              checked={effect.targetRules.tributeComposition.requireSingleSummonTarget}
              onChange={(checked) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  targetRules: current.targetRules.tributeComposition
                    ? {
                        ...current.targetRules,
                        tributeComposition: {
                          ...current.targetRules.tributeComposition,
                          requireSingleSummonTarget: checked,
                        },
                      }
                    : current.targetRules,
                }))}
              ariaLabel="Require Single Summon Target"
            />
            Require Single Summon Target
          </label>

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] sm:col-span-2">
            <CardAdminToggleSwitch
              checked={effect.targetRules.tributeComposition.requireDistinctSummonAndTributes}
              onChange={(checked) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  targetRules: current.targetRules.tributeComposition
                    ? {
                        ...current.targetRules,
                        tributeComposition: {
                          ...current.targetRules.tributeComposition,
                          requireDistinctSummonAndTributes: checked,
                        },
                      }
                    : current.targetRules,
                }))}
              ariaLabel="Require Distinct Summon And Tributes"
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
                      <CardAdminSelect
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
                      >
                        {TARGET_RANGE_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </CardAdminSelect>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Zone</label>
                      <CardAdminSelect
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
                      >
                        {zoneOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </CardAdminSelect>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Location Selector</label>
                      <CardAdminSelect
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
                      >
                        {TARGET_LOCATION_SELECTOR_KIND_OPTIONS.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </CardAdminSelect>
                    </div>

                    {showsTributeRole ? (
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Tribute Role</label>
                        <CardAdminSelect
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
                        >
                          <option value="">None</option>
                          {TRIBUTE_ROLE_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </CardAdminSelect>
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
                  <CardAdminSelect
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
                  >
                    {MATCH_MODE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </CardAdminSelect>
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
                        <CardAdminSelect
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
                        </CardAdminSelect>

                        <CardAdminSelect
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
                        </CardAdminSelect>

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
                          <CardAdminToggleSwitch
                            checked={predicate.ignoreCase}
                            onChange={(checked) =>
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
                                                ? { ...row, ignoreCase: checked }
                                                : row),
                                          },
                                        }
                                      : rule),
                                },
                              }))}
                            ariaLabel="Ignore Case"
                          />
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
  )
}
