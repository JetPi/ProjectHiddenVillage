import { AppButton } from '@/components/ui'
import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import { CountConstraintField } from '@/views/admin/components/controls'
import {
  MATCH_MODE_OPTIONS,
  PLAYER_ZONE_OPTIONS,
  RULE_OPERATOR_OPTIONS,
} from '@/views/admin/constants'
import type {
  ICardAdminContextRulePlayerPanelProps,
  ICardAdminContextRulesPanelProps,
} from '@/views/admin/types/cardAdminEffectPanels'
import type { ICountConstraintMode } from '@/views/admin/types/countConstraintField'
import {
  appendPredicateEntries,
  createDefaultContextRule,
  createDefaultPredicate,
  createDefaultZoneAmountRequirement,
  createDefaultZoneRequirementSet,
  getPredicateEntries,
  removePredicateEntryAt,
} from '@/views/admin/utils'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminPredicateControls } from '@/views/admin/components/controls'
import { CardAdminPredicateFooter } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'

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
            <CardAdminRemoveButton
              onClick={() =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  contextRules: current.contextRules.filter((_, index) => index !== contextRuleIndex),
                }))}
              ariaLabel="Remove Context Rule"
            >
              Remove
            </CardAdminRemoveButton>
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
        <CardAdminToggleSwitch
          checked={audienceValue !== null}
          onChange={(checked) =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              contextRules: current.contextRules.map((row, index) =>
                index === contextRuleIndex
                  ? {
                      ...row,
                      [audience]: checked ? { inZone: null, inZoneRequirements: null } : null,
                    }
                  : row),
            }))}
          ariaLabel={`${title} Condition Enabled`}
        />
        {title} Condition Enabled
      </label>

      {audienceValue ? (
        <>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{title} In Zone</label>
            <CardAdminSelect
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
            >
              <option value="">None</option>
              {PLAYER_ZONE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CardAdminSelect>
          </div>

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <CardAdminToggleSwitch
              checked={audienceValue.inZoneRequirements !== null}
              onChange={(checked) =>
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
                        inZoneRequirements: checked ? createDefaultZoneRequirementSet() : null,
                      },
                    }
                  }),
                }))}
              ariaLabel={`${title} In-Zone Requirements Enabled`}
            />
            {title} In-Zone Requirements Enabled
          </label>

          {audienceValue.inZoneRequirements ? (
            <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/25 bg-[var(--surface-muted)] p-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Requirement Operator</label>
                  <CardAdminSelect
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
                  </CardAdminSelect>
                </div>

                <label className="inline-flex h-10 self-end items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]">
                  <span>Distinct Cards Across Requirements</span>
                  <CardAdminToggleSwitch
                    checked={audienceValue.inZoneRequirements.distinctCardsAcrossRequirements}
                    onChange={(checked) =>
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
                                distinctCardsAcrossRequirements: checked,
                              },
                            },
                          }
                        }),
                      }))}
                    ariaLabel="Distinct Cards Across Requirements"
                  />
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

                      <CardAdminSelect
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
                      </CardAdminSelect>

                      <CardAdminRemoveButton
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
                        className="inline-flex w-fit justify-self-end self-center"
                        ariaLabel="Remove Requirement"
                      />
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
                            <CardAdminPredicateControls
                              predicateProperty={predicate.property}
                              predicateOperator={predicate.operator}
                              predicateEntries={predicateEntries}
                              onPropertyChange={(property) =>
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
                                                        ? { ...rowPredicate, property }
                                                        : rowPredicate),
                                                  },
                                                }
                                              : entry),
                                        },
                                      },
                                    }
                                  }),
                                }))}
                              onOperatorChange={(operator) =>
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
                                                        ? { ...rowPredicate, operator }
                                                        : rowPredicate),
                                                  },
                                                }
                                              : entry),
                                        },
                                      },
                                    }
                                  }),
                                }))}
                              onAddValue={(inputValue) =>
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
                                }))}
                            />

                            <CardAdminPredicateFooter
                              predicateEntries={predicateEntries}
                              ignoreCase={predicate.ignoreCase}
                              onRemoveEntry={(entryIndex) =>
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
                              onIgnoreCaseChange={(checked) =>
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
                                                        ? { ...rowPredicate, ignoreCase: checked }
                                                        : rowPredicate),
                                                  },
                                                }
                                              : entry),
                                        },
                                      },
                                    }
                                  }),
                                }))
                              }
                              onRemovePredicate={() =>
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
                                }))
                              }
                            />
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
