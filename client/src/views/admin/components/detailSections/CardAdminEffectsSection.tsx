import { useState } from 'react'
import { AppButton } from '@/components/ui'
import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'
import {
  EFFECT_DURATION_MODE_OPTIONS,
  EFFECT_KIND_OPTIONS,
  EFFECT_TIMING_OPTIONS,
  PASSIVE_MODE_OPTIONS,
  RESTRICTIONS_OPTIONS,
  RUNTIME_EFFECT_OPTIONS,
  TARGET_RANGE_OPTIONS,
} from '@/views/admin/constants'
import {
  createDefaultPassiveReevaluation,
  createDefaultTargetRule,
  isAttackNegationRuntimeEffect,
  isSummonOrTributeRuntimeEffect,
  normalizeEffectId,
  normalizeRevealRuleZone,
  parseNullableInteger,
} from '@/views/admin/utils'
import {
  CardAdminAttributeModificationsPanel,
  CardAdminChakraAdjustmentsPanel,
  CardAdminContextRulesPanel,
  CardAdminExecutionPanel,
  CardAdminFaceStateFlipsPanel,
  CardAdminFaceStateLocksPanel,
  CardAdminGainEffectPanel,
  CardAdminMoveCardActionsPanel,
  CardAdminPassiveSettingsPanel,
  CardAdminRevealCardPanel,
  CardAdminSummonSettingsPanel,
  CardAdminTargetRulesPanel,
} from '@/views/admin/components/detailPanels'
import type { ICardAdminEffectsSectionProps } from '@/views/admin/types/cardAdminDetailSections'

export function CardAdminEffectsSection({
  parsedEffects,
  collapsedEffects,
  toggleEffectCollapsedAt,
  reorderEffect,
  removeEffectAt,
  addEffect,
  updateEffectAt,
  effectIdOptions,
  linkedEffectGroups,
  effectConditionKeywordOptions,
  effectsError,
  effectBranchErrors,
}: ICardAdminEffectsSectionProps) {
  const [draggedEffectIndex, setDraggedEffectIndex] = useState<number | null>(null)

  return (
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
          <div
            key={`effect-${effectIndex}`}
            className="space-y-3 rounded-xl border border-[var(--border-subtle)] border-l-4 border-l-slate-400/55 bg-[var(--surface)] p-3 shadow-sm"
            draggable={collapsedEffects.has(effectIndex)}
            onDragStart={() => setDraggedEffectIndex(effectIndex)}
            onDragOver={(event) => {
              if (draggedEffectIndex === null || draggedEffectIndex === effectIndex) {
                return
              }
              event.preventDefault()
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (draggedEffectIndex === null || draggedEffectIndex === effectIndex) {
                return
              }
              reorderEffect(draggedEffectIndex, effectIndex)
              setDraggedEffectIndex(null)
            }}
            onDragEnd={() => setDraggedEffectIndex(null)}
          >
            <div
              className="flex flex-nowrap items-center gap-1 overflow-hidden cursor-grab active:cursor-grabbing"
            >
              <CardAdminRemoveButton
                onClick={() => removeEffectAt(effectIndex)}
                className="h-6 w-6 shrink-0"
                ariaLabel="Remove Effect"
              />

              <input
                type="text"
                value={effect.id}
                onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, id: event.target.value }))}
                className="h-7 min-w-0 flex-[1.2] rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 text-[11px] text-[var(--text-primary)]"
                placeholder={`Effect ${effectIndex + 1}`}
              />

              <div className="flex min-w-0 flex-[1] items-center gap-1">
                <span className="text-xs text-emerald-600" aria-hidden="true">✓</span>
                <CardAdminSelect
                  value={effect.onSuccessEffectId ?? ''}
                  onChange={(event) =>
                    updateEffectAt(effectIndex, (current) => ({
                      ...current,
                      onSuccessEffectId: event.target.value.trim().length > 0 ? event.target.value : null,
                    }))}
                  className="h-7 min-w-0 px-2 py-0 text-[11px]"
                >
                  <option value="">None</option>
                  {effectIdOptions
                    .filter((id) => id !== normalizeEffectId(effect.id))
                    .map((idOption) => (
                      <option key={idOption} value={idOption}>{idOption}</option>
                    ))}
                </CardAdminSelect>
              </div>

              <div className="flex min-w-0 flex-[1] items-center gap-1">
                <span className="text-xs text-rose-600" aria-hidden="true">✕</span>
                <CardAdminSelect
                  value={effect.onFailureEffectId ?? ''}
                  onChange={(event) =>
                    updateEffectAt(effectIndex, (current) => ({
                      ...current,
                      onFailureEffectId: event.target.value.trim().length > 0 ? event.target.value : null,
                    }))}
                  className="h-7 min-w-0 px-2 py-0 text-[11px]"
                >
                  <option value="">None</option>
                  {effectIdOptions
                    .filter((id) => id !== normalizeEffectId(effect.id))
                    .map((idOption) => (
                      <option key={idOption} value={idOption}>{idOption}</option>
                    ))}
                </CardAdminSelect>
              </div>

              <div className="flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                <span>Ch</span>
                <CardAdminToggleSwitch
                  checked={effect.chakraCost !== null}
                  onChange={(checked) =>
                    updateEffectAt(effectIndex, (current) => ({
                      ...current,
                      chakraCost: checked ? current.chakraCost ?? 0 : null,
                    }))}
                  ariaLabel="Chakra Cost Enabled"
                />
                <input
                  type="number"
                  value={effect.chakraCost ?? ''}
                  onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, chakraCost: parseNullableInteger(event.target.value) }))}
                  disabled={effect.chakraCost === null}
                  className="h-6 w-11 rounded border border-[var(--border-subtle)] bg-[var(--surface)] px-1 text-[11px] text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                <span>Opt</span>
                <CardAdminToggleSwitch
                  checked={effect.isOptional}
                  onChange={(checked) => updateEffectAt(effectIndex, (current) => ({ ...current, isOptional: checked }))}
                  ariaLabel="Optional"
                />
              </div>

              <div className="flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                <span>Sub</span>
                <CardAdminToggleSwitch
                  checked={effect.isSubordinate}
                  onChange={(checked) => updateEffectAt(effectIndex, (current) => ({ ...current, isSubordinate: checked }))}
                  ariaLabel="Is Subordinate"
                />
              </div>

              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => toggleEffectCollapsedAt(effectIndex)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text-primary)]"
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
                <span
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)]"
                  aria-hidden="true"
                  title="Drag to reorder"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
                    <circle cx="7" cy="6" r="1.2" />
                    <circle cx="13" cy="6" r="1.2" />
                    <circle cx="7" cy="10" r="1.2" />
                    <circle cx="13" cy="10" r="1.2" />
                    <circle cx="7" cy="14" r="1.2" />
                    <circle cx="13" cy="14" r="1.2" />
                  </svg>
                </span>
              </div>
            </div>

            {!collapsedEffects.has(effectIndex) ? (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="space-y-1 md:col-span-3">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Global Restrictions</label>
                    <CardAdminSelect
                      value={effect.globalRestrictions}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, globalRestrictions: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {RESTRICTIONS_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </CardAdminSelect>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Runtime Effect Type</label>
                    <CardAdminSelect
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
                    </CardAdminSelect>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Effect Type</label>
                    <CardAdminSelect
                      value={effect.effectType}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, effectType: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {EFFECT_KIND_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </CardAdminSelect>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Timing</label>
                    <CardAdminSelect
                      value={effect.timing}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, timing: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {EFFECT_TIMING_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </CardAdminSelect>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Duration</label>
                    <CardAdminSelect
                      value={effect.durationMode}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, durationMode: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {EFFECT_DURATION_MODE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </CardAdminSelect>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Passive Mode</label>
                    <CardAdminSelect
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
                    </CardAdminSelect>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Range</label>
                    <CardAdminSelect
                      value={effect.targetRange}
                      onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, targetRange: event.target.value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {TARGET_RANGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </CardAdminSelect>
                  </div>

                </div>

                {effect.runtimeEffectType === 'Summon Card' ? (
                  <CardAdminSummonSettingsPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                  />
                ) : null}

                {effect.runtimeEffectType === 'Reveal Card' ? (
                  <CardAdminRevealCardPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                  />
                ) : null}

                <CardAdminExecutionPanel
                  effect={effect}
                  effectIndex={effectIndex}
                  updateEffectAt={updateEffectAt}
                  effectBranchErrors={effectBranchErrors[effectIndex]}
                />

                {effect.passiveMode !== 'None' ? (
                  <CardAdminPassiveSettingsPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                  />
                ) : null}

                {effect.runtimeEffectType === 'Gain Effect' ? (
                  <CardAdminGainEffectPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                    effectConditionKeywordOptions={effectConditionKeywordOptions}
                  />
                ) : null}

                <CardAdminTargetRulesPanel
                  effect={effect}
                  effectIndex={effectIndex}
                  updateEffectAt={updateEffectAt}
                />

                <CardAdminContextRulesPanel
                  effect={effect}
                  effectIndex={effectIndex}
                  updateEffectAt={updateEffectAt}
                />

                {effect.runtimeEffectType === 'Change Values' ? (
                  <CardAdminAttributeModificationsPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                  />
                ) : null}

                {effect.runtimeEffectType === 'Alter Resources' ? (
                  <CardAdminChakraAdjustmentsPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                  />
                ) : null}

                {effect.runtimeEffectType === 'Alter Resources' ? (
                  <CardAdminFaceStateFlipsPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                  />
                ) : null}

                {effect.runtimeEffectType === 'Alter Resources' ? (
                  <CardAdminFaceStateLocksPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                  />
                ) : null}

                {effect.runtimeEffectType === 'Move Card' ? (
                  <CardAdminMoveCardActionsPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </div>

      {effectsError ? (
        <p className="text-xs text-red-500">{effectsError}</p>
      ) : null}
    </div>
  )
}
