import { AppButton } from '@/components/ui'
import {
  MATCH_MODE_OPTIONS,
  PREDICATE_OPERATOR_OPTIONS,
  PREDICATE_PROPERTY_OPTIONS,
  REVEAL_TIMING_MODE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminRevealCardPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import type { ICardCatalogPredicateProperty } from '@/services/api/types/cardCatalog'
import {
  appendPredicateEntries,
  createDefaultPredicate,
  getPredicateEntries,
  removePredicateEntryAt,
  resolveRevealPostConditionRuleSet,
} from '@/views/admin/utils'

export function CardAdminRevealCardPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminRevealCardPanelProps) {
  return (
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
  )
}
