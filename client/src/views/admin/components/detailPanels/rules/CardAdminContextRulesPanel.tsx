import { useTranslation } from 'react-i18next'
import { translateKey } from '@/i18n'
import { AppButton } from '@/components/ui'
import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import { CountConstraintField } from '@/views/admin/components/controls'
import {
  MATCH_MODE_LABEL_KEYS,
  MATCH_MODE_OPTIONS,
  optionLabel,
  PLAYER_ZONE_LABEL_KEYS,
  PLAYER_ZONE_OPTIONS,
  RULE_OPERATOR_LABEL_KEYS,
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
import { CardAdminChevronIcon } from '@/views/admin/components/controls'

export function CardAdminContextRulesPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminContextRulesPanelProps) {
  const { t } = useTranslation()

  return (
    <details className="group border-t border-[var(--border-subtle)] border-l-2 border-l-cyan-500/55 pl-3 pt-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>{t('admin.panels.contextRules.title')}</span>
        <CardAdminChevronIcon rotateOnOpen />
      </summary>

      <div className="mt-3 space-y-3">

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
          {t('admin.panels.contextRules.addContextRule')}
        </AppButton>
      </div>

      {effect.contextRules.map((_, contextRuleIndex) => (
        <div key={`context-rule-${contextRuleIndex}`} className="space-y-3 border-l-2 border-l-cyan-500/30 pl-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">{translateKey(t, 'admin.panels.contextRules.contextNumber', { number: contextRuleIndex + 1 })}</p>
            <CardAdminRemoveButton
              onClick={() =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  contextRules: current.contextRules.filter((_, index) => index !== contextRuleIndex),
                }))}
              ariaLabel={t('admin.panels.contextRules.removeContextRule')}
            >
              {t('admin.panels.contextRules.remove')}
            </CardAdminRemoveButton>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <ContextRulePlayerPanel
              audience="player"
              title={t('admin.panels.contextRules.player')}
              effect={effect}
              effectIndex={effectIndex}
              contextRuleIndex={contextRuleIndex}
              updateEffectAt={updateEffectAt}
            />

            <ContextRulePlayerPanel
              audience="opponent"
              title={t('admin.panels.contextRules.opponent')}
              effect={effect}
              effectIndex={effectIndex}
              contextRuleIndex={contextRuleIndex}
              updateEffectAt={updateEffectAt}
            />
          </div>
        </div>
      ))}
      </div>
    </details>
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
  const { t } = useTranslation()
  const contextRule = effect.contextRules[contextRuleIndex]
  const audienceValue = contextRule[audience]

  return (
    <details className="group border-t border-[var(--border-subtle)] border-l-2 border-l-cyan-500/55 pl-3 pt-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>{translateKey(t, 'admin.panels.contextRules.conditionsTitle', { title })}</span>
        <CardAdminChevronIcon rotateOnOpen />
      </summary>

      <div className="mt-2 space-y-2">
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
          ariaLabel={translateKey(t, 'admin.panels.contextRules.conditionEnabled', { title })}
        />
        {translateKey(t, 'admin.panels.contextRules.conditionEnabled', { title })}
      </label>

      {audienceValue ? (
        <>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{translateKey(t, 'admin.panels.contextRules.inZone', { title })}</label>
            <CardAdminSelect
              value={audienceValue.inZone ?? ''}
              onValueChange={(value) =>
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
                      [audience]: { ...nextAudienceValue, inZone: value || null },
                    }
                  }),
                }))}
            >
              <option value="">{t('admin.panels.contextRules.none')}</option>
              {PLAYER_ZONE_OPTIONS.map((option) => (
                <option key={option} value={option}>{optionLabel(t, PLAYER_ZONE_LABEL_KEYS, option)}</option>
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
              ariaLabel={translateKey(t, 'admin.panels.contextRules.requirementsEnabled', { title })}
            />
            {translateKey(t, 'admin.panels.contextRules.requirementsEnabled', { title })}
          </label>

          {audienceValue.inZoneRequirements ? (
            <div className="space-y-2 border-l-2 border-l-cyan-500/30 pl-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('admin.panels.contextRules.requirementOperator')}</label>
                  <CardAdminSelect
                    value={audienceValue.inZoneRequirements.operator}
                    onValueChange={(value) =>
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
                                operator: value,
                              },
                            },
                          }
                        }),
                      }))}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  >
                    {RULE_OPERATOR_OPTIONS.map((option) => (
                      <option key={option} value={option}>{optionLabel(t, RULE_OPERATOR_LABEL_KEYS, option)}</option>
                    ))}
                  </CardAdminSelect>
                </div>

                <label className="inline-flex h-10 self-end items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-primary)]">
                  <span>{t('admin.panels.contextRules.distinctCards')}</span>
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
                    ariaLabel={t('admin.panels.contextRules.distinctCards')}
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
                  {translateKey(t, 'admin.panels.contextRules.addRequirement', { title })}
                </AppButton>
              </div>

              {audienceValue.inZoneRequirements.requirements.map((requirement, requirementIndex) => {
                const requirementPredicateKey = `${audience}-requirement-${requirementIndex}`

                return (
                  <div key={requirementPredicateKey} className="space-y-2 border-l-2 border-l-cyan-500/30 pl-2">
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
                        onValueChange={(value) =>
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
                                              matchMode: value,
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
                          <option key={option} value={option}>{optionLabel(t, MATCH_MODE_LABEL_KEYS, option)}</option>
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
                        ariaLabel={t('admin.panels.contextRules.removeRequirement')}
                      />
                    </div>

                    <div className="space-y-2 border-l-2 border-l-cyan-500/30 pl-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[var(--text-secondary)]">{t('admin.panels.contextRules.predicates')}</p>
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
                          {t('admin.panels.contextRules.addPredicate')}
                        </AppButton>
                      </div>

                      {requirement.restriction.predicates.map((predicate, predicateIndex) => {
                        const predicateEntries = getPredicateEntries(predicate)

                        return (
                          <div key={`${requirementPredicateKey}-predicate-${predicateIndex}`} className="space-y-2 border-l-2 border-l-cyan-500/30 pl-2">
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
    </details>
  )
}
