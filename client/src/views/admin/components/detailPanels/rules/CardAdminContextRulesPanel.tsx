import { AppButton } from '@/components/ui'
import { CountConstraintField } from '@/views/admin/components/CountConstraintField'
import {
  MATCH_MODE_OPTIONS,
  PLAYER_ZONE_OPTIONS,
  PREDICATE_OPERATOR_OPTIONS,
  PREDICATE_PROPERTY_OPTIONS,
  RULE_OPERATOR_OPTIONS,
} from '@/views/admin/constants'
import type {
  ICardAdminContextRulePlayerPanelProps,
  ICardAdminContextRulesPanelProps,
} from '@/views/admin/types/cardAdminEffectPanels'
import type { ICountConstraintMode } from '@/views/admin/types/countConstraintField'
import type { ICardCatalogPredicateProperty } from '@/services/api/types/cardCatalog'
import {
  appendPredicateEntries,
  createDefaultContextRule,
  createDefaultPredicate,
  createDefaultZoneAmountRequirement,
  createDefaultZoneRequirementSet,
  getPredicateEntries,
  removePredicateEntryAt,
} from '@/views/admin/utils'

export function CardAdminContextRulesPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminContextRulesPanelProps) {
  return (
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

      {effect.contextRules.map((_, contextRuleIndex) => (
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
            <ContextRulePlayerPanel
              audience="player"
              title="Player"
              effect={effect}
              effectIndex={effectIndex}
              contextRuleIndex={contextRuleIndex}
              updateEffectAt={updateEffectAt}
            />

            <ContextRulePlayerPanel
              audience="opponent"
              title="Opponent"
              effect={effect}
              effectIndex={effectIndex}
              contextRuleIndex={contextRuleIndex}
              updateEffectAt={updateEffectAt}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function ContextRulePlayerPanel({
  audience,
  title,
  effect,
  effectIndex,
  contextRuleIndex,
  updateEffectAt,
}: ICardAdminContextRulePlayerPanelProps) {
  const contextRule = effect.contextRules[contextRuleIndex]
  const audienceValue = contextRule[audience]

  return (
    <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/30 bg-[var(--surface)] p-3">
      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
        <input
          type="checkbox"
          checked={audienceValue !== null}
          onChange={(event) =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              contextRules: current.contextRules.map((row, index) =>
                index === contextRuleIndex
                  ? {
                      ...row,
                      [audience]: event.target.checked ? { inZone: null, inZoneRequirements: null } : null,
                    }
                  : row),
            }))}
        />
        {title} Condition Enabled
      </label>

      {audienceValue ? (
        <>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{title} In Zone</label>
            <select
              value={audienceValue.inZone ?? ''}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  contextRules: current.contextRules.map((row, index) => {
                    if (index !== contextRuleIndex) {
                      return row
                    }

                    const nextAudienceValue = row[audience]
                    if (!nextAudienceValue) {
                      return row
                    }

                    return {
                      ...row,
                      [audience]: { ...nextAudienceValue, inZone: event.target.value || null },
                    }
                  }),
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
              checked={audienceValue.inZoneRequirements !== null}
              onChange={(event) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  contextRules: current.contextRules.map((row, index) => {
                    if (index !== contextRuleIndex) {
                      return row
                    }

                    const nextAudienceValue = row[audience]
                    if (!nextAudienceValue) {
                      return row
                    }

                    return {
                      ...row,
                      [audience]: {
                        ...nextAudienceValue,
                        inZoneRequirements: event.target.checked ? createDefaultZoneRequirementSet() : null,
                      },
                    }
                  }),
                }))}
            />
            {title} In-Zone Requirements Enabled
          </label>

          {audienceValue.inZoneRequirements ? (
            <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/25 bg-[var(--surface-muted)] p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Requirement Operator</label>
                  <select
                    value={audienceValue.inZoneRequirements.operator}
                    onChange={(event) =>
                      updateEffectAt(effectIndex, (current) => ({
                        ...current,
                        contextRules: current.contextRules.map((row, index) => {
                          if (index !== contextRuleIndex) {
                            return row
                          }

                          const nextAudienceValue = row[audience]
                          if (!nextAudienceValue?.inZoneRequirements) {
                            return row
                          }

                          return {
                            ...row,
                            [audience]: {
                              ...nextAudienceValue,
                              inZoneRequirements: {
                                ...nextAudienceValue.inZoneRequirements,
                                operator: event.target.value,
                              },
                            },
                          }
                        }),
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
                      checked={audienceValue.inZoneRequirements.distinctCardsAcrossRequirements}
                      onChange={(event) =>
                        updateEffectAt(effectIndex, (current) => ({
                          ...current,
                          contextRules: current.contextRules.map((row, index) => {
                            if (index !== contextRuleIndex) {
                              return row
                            }

                            const nextAudienceValue = row[audience]
                            if (!nextAudienceValue?.inZoneRequirements) {
                              return row
                            }

                            return {
                              ...row,
                              [audience]: {
                                ...nextAudienceValue,
                                inZoneRequirements: {
                                  ...nextAudienceValue.inZoneRequirements,
                                  distinctCardsAcrossRequirements: event.target.checked,
                                },
                              },
                            }
                          }),
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
                      contextRules: current.contextRules.map((row, index) => {
                        if (index !== contextRuleIndex) {
                          return row
                        }

                        const nextAudienceValue = row[audience]
                        if (!nextAudienceValue?.inZoneRequirements) {
                          return row
                        }

                        return {
                          ...row,
                          [audience]: {
                            ...nextAudienceValue,
                            inZoneRequirements: {
                              ...nextAudienceValue.inZoneRequirements,
                              requirements: [createDefaultZoneAmountRequirement(), ...nextAudienceValue.inZoneRequirements.requirements],
                            },
                          },
                        }
                      }),
                    }))}
                >
                  Add {title} Requirement
                </AppButton>
              </div>

              {audienceValue.inZoneRequirements.requirements.map((requirement, requirementIndex) => {
                const requirementPredicateKey = `${audience}-requirement-${requirementIndex}`

                return (
                  <div key={requirementPredicateKey} className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/20 bg-[var(--surface)] p-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                      <CountConstraintField
                        className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2"
                        mode={requirement.comparison as ICountConstraintMode}
                        value={requirement.amount}
                        onModeChange={(selectedMode) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            contextRules: current.contextRules.map((row, index) => {
                              if (index !== contextRuleIndex) {
                                return row
                              }

                              const nextAudienceValue = row[audience]
                              if (!nextAudienceValue?.inZoneRequirements) {
                                return row
                              }

                              return {
                                ...row,
                                [audience]: {
                                  ...nextAudienceValue,
                                  inZoneRequirements: {
                                    ...nextAudienceValue.inZoneRequirements,
                                    requirements: nextAudienceValue.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                      entryIndex === requirementIndex
                                        ? { ...entry, comparison: selectedMode }
                                        : entry),
                                  },
                                },
                              }
                            }),
                          }))}
                        onValueChange={(parsedValue) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            contextRules: current.contextRules.map((row, index) => {
                              if (index !== contextRuleIndex) {
                                return row
                              }

                              const nextAudienceValue = row[audience]
                              if (!nextAudienceValue?.inZoneRequirements) {
                                return row
                              }

                              return {
                                ...row,
                                [audience]: {
                                  ...nextAudienceValue,
                                  inZoneRequirements: {
                                    ...nextAudienceValue.inZoneRequirements,
                                    requirements: nextAudienceValue.inZoneRequirements.requirements.map((entry, entryIndex) =>
                                      entryIndex === requirementIndex
                                        ? { ...entry, amount: parsedValue ?? 0 }
                                        : entry),
                                  },
                                },
                              }
                            }),
                          }))}
                      />

                      <select
                        value={requirement.restriction.matchMode}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            contextRules: current.contextRules.map((row, index) => {
                              if (index !== contextRuleIndex) {
                                return row
                              }

                              const nextAudienceValue = row[audience]
                              if (!nextAudienceValue?.inZoneRequirements) {
                                return row
                              }

                              return {
                                ...row,
                                [audience]: {
                                  ...nextAudienceValue,
                                  inZoneRequirements: {
                                    ...nextAudienceValue.inZoneRequirements,
                                    requirements: nextAudienceValue.inZoneRequirements.requirements.map((entry, entryIndex) =>
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
                                },
                              }
                            }),
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
                            contextRules: current.contextRules.map((row, index) => {
                              if (index !== contextRuleIndex) {
                                return row
                              }

                              const nextAudienceValue = row[audience]
                              if (!nextAudienceValue?.inZoneRequirements) {
                                return row
                              }

                              return {
                                ...row,
                                [audience]: {
                                  ...nextAudienceValue,
                                  inZoneRequirements: {
                                    ...nextAudienceValue.inZoneRequirements,
                                    requirements: nextAudienceValue.inZoneRequirements.requirements.filter((_, entryIndex) => entryIndex !== requirementIndex),
                                  },
                                },
                              }
                            }),
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
                              contextRules: current.contextRules.map((row, index) => {
                                if (index !== contextRuleIndex) {
                                  return row
                                }

                                const nextAudienceValue = row[audience]
                                if (!nextAudienceValue?.inZoneRequirements) {
                                  return row
                                }

                                return {
                                  ...row,
                                  [audience]: {
                                    ...nextAudienceValue,
                                    inZoneRequirements: {
                                      ...nextAudienceValue.inZoneRequirements,
                                      requirements: nextAudienceValue.inZoneRequirements.requirements.map((entry, entryIndex) =>
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
                                  },
                                }
                              }),
                            }))}
                        >
                          Add Predicate
                        </AppButton>
                      </div>

                      {requirement.restriction.predicates.map((predicate, predicateIndex) => {
                        const predicateEntries = getPredicateEntries(predicate)

                        return (
                          <div key={`${requirementPredicateKey}-predicate-${predicateIndex}`} className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/15 bg-[var(--surface)] p-2">
                            <div className="flex flex-wrap items-start gap-2">
                              <select
                                value={predicate.property}
                                onChange={(event) =>
                                  updateEffectAt(effectIndex, (current) => ({
                                    ...current,
                                    contextRules: current.contextRules.map((row, index) => {
                                      if (index !== contextRuleIndex) {
                                        return row
                                      }

                                      const nextAudienceValue = row[audience]
                                      if (!nextAudienceValue?.inZoneRequirements) {
                                        return row
                                      }

                                      return {
                                        ...row,
                                        [audience]: {
                                          ...nextAudienceValue,
                                          inZoneRequirements: {
                                            ...nextAudienceValue.inZoneRequirements,
                                            requirements: nextAudienceValue.inZoneRequirements.requirements.map((entry, entryIndex) =>
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
                                        },
                                      }
                                    }),
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
                                    contextRules: current.contextRules.map((row, index) => {
                                      if (index !== contextRuleIndex) {
                                        return row
                                      }

                                      const nextAudienceValue = row[audience]
                                      if (!nextAudienceValue?.inZoneRequirements) {
                                        return row
                                      }

                                      return {
                                        ...row,
                                        [audience]: {
                                          ...nextAudienceValue,
                                          inZoneRequirements: {
                                            ...nextAudienceValue.inZoneRequirements,
                                            requirements: nextAudienceValue.inZoneRequirements.requirements.map((entry, entryIndex) =>
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
                                        },
                                      }
                                    }),
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
                                      contextRules: current.contextRules.map((row, index) => {
                                        if (index !== contextRuleIndex) {
                                          return row
                                        }

                                        const nextAudienceValue = row[audience]
                                        if (!nextAudienceValue?.inZoneRequirements) {
                                          return row
                                        }

                                        return {
                                          ...row,
                                          [audience]: {
                                            ...nextAudienceValue,
                                            inZoneRequirements: {
                                              ...nextAudienceValue.inZoneRequirements,
                                              requirements: nextAudienceValue.inZoneRequirements.requirements.map((entry, entryIndex) =>
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
                                          },
                                        }
                                      }),
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
                                          contextRules: current.contextRules.map((row, index) => {
                                            if (index !== contextRuleIndex) {
                                              return row
                                            }

                                            const nextAudienceValue = row[audience]
                                            if (!nextAudienceValue?.inZoneRequirements) {
                                              return row
                                            }

                                            return {
                                              ...row,
                                              [audience]: {
                                                ...nextAudienceValue,
                                                inZoneRequirements: {
                                                  ...nextAudienceValue.inZoneRequirements,
                                                  requirements: nextAudienceValue.inZoneRequirements.requirements.map((requirementEntry, requirementEntryIndex) =>
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
                                              },
                                            }
                                          }),
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
                                        contextRules: current.contextRules.map((row, index) => {
                                          if (index !== contextRuleIndex) {
                                            return row
                                          }

                                          const nextAudienceValue = row[audience]
                                          if (!nextAudienceValue?.inZoneRequirements) {
                                            return row
                                          }

                                          return {
                                            ...row,
                                            [audience]: {
                                              ...nextAudienceValue,
                                              inZoneRequirements: {
                                                ...nextAudienceValue.inZoneRequirements,
                                                requirements: nextAudienceValue.inZoneRequirements.requirements.map((entry, entryIndex) =>
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
                                            },
                                          }
                                        }),
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
                                    contextRules: current.contextRules.map((row, index) => {
                                      if (index !== contextRuleIndex) {
                                        return row
                                      }

                                      const nextAudienceValue = row[audience]
                                      if (!nextAudienceValue?.inZoneRequirements) {
                                        return row
                                      }

                                      return {
                                        ...row,
                                        [audience]: {
                                          ...nextAudienceValue,
                                          inZoneRequirements: {
                                            ...nextAudienceValue.inZoneRequirements,
                                            requirements: nextAudienceValue.inZoneRequirements.requirements.map((entry, entryIndex) =>
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
                                        },
                                      }
                                    }),
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
          ) : null}
        </>
      ) : null}
    </div>
  )
}
