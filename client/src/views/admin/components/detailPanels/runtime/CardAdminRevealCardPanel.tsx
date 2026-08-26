import { AppButton } from '@/components/ui'
import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'
import {
  MATCH_MODE_OPTIONS,
  REVEAL_TIMING_MODE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminRevealCardPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import {
  appendPredicateEntries,
  createDefaultPredicate,
  getPredicateEntries,
  removePredicateEntryAt,
  resolveRevealPostConditionRuleSet,
} from '@/views/admin/utils'
import { CardAdminPredicateControls } from '@/views/admin/components/controls'
import { CardAdminPredicateFooter } from '@/views/admin/components/controls'

export function CardAdminRevealCardPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminRevealCardPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-emerald-500/55 bg-[var(--surface-muted)] p-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Reveal Timing</label>
        <CardAdminSelect
          value={effect.revealTimingMode}
          onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, revealTimingMode: event.target.value }))}
        >
          {REVEAL_TIMING_MODE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </CardAdminSelect>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] sm:col-span-2">
        <CardAdminToggleSwitch
          checked={resolveRevealPostConditionRuleSet(effect) !== null}
          onChange={(checked) =>
            updateEffectAt(effectIndex, (current) => {
              const currentRuleSet = resolveRevealPostConditionRuleSet(current)
              const nextRuleSet = checked
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
                revealTimingMode: checked ? 'Reveal First' : current.revealTimingMode,
              }
            })}
          ariaLabel="Post-Reveal Rule Set Enabled"
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
            <CardAdminSelect
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
            >
              {MATCH_MODE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CardAdminSelect>
          </div>

          {(resolveRevealPostConditionRuleSet(effect)?.restrictions ?? []).map((restriction, groupIndex) => (
            <div
              key={`reveal-post-group-${groupIndex}`}
              className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-emerald-500/30 bg-[var(--surface-muted)] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Group {groupIndex + 1}</p>
                <CardAdminRemoveButton
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
                  ariaLabel="Remove Group"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Group Match Mode</label>
                  <CardAdminSelect
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
                  >
                    {MATCH_MODE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </CardAdminSelect>
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
                    <CardAdminPredicateControls
                      predicateProperty={predicate.property}
                      predicateOperator={predicate.operator}
                      predicateEntries={predicateEntries}
                      onPropertyChange={(property) =>
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
                                          ? { ...row, property }
                                          : row),
                                    }
                                  : group),
                            },
                            revealPostConditionRestriction: null,
                            revealPostConditionPredicate: null,
                          }
                        })}
                      onOperatorChange={(operator) =>
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
                                          ? { ...row, operator }
                                          : row),
                                    }
                                  : group),
                            },
                            revealPostConditionRestriction: null,
                            revealPostConditionPredicate: null,
                          }
                        })}
                      onAddValue={(inputValue) =>
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
                        })}
                    />

                    <CardAdminPredicateFooter
                      predicateEntries={predicateEntries}
                      ignoreCase={predicate.ignoreCase}
                      onRemoveEntry={(entryIndex) =>
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
                      onIgnoreCaseChange={(checked) =>
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
                                          ? { ...row, ignoreCase: checked }
                                          : row),
                                    }
                                  : group),
                            },
                            revealPostConditionRestriction: null,
                            revealPostConditionPredicate: null,
                          }
                        })
                      }
                      onRemovePredicate={() =>
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
                    />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
