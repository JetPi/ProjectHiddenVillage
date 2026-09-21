import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { twMerge } from 'tailwind-merge'
import { AppButton } from '@/components/ui'
import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'
import { CardAdminChevronIcon } from '@/views/admin/components/controls'
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
  CardAdminSearchCardPanel,
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
  const [dragOverEffectIndex, setDragOverEffectIndex] = useState<number | null>(null)
  // The card-sized ghost handed to the browser during a drag (`setDragImage` snapshots it immediately).
  const dragPreviewRef = useRef<HTMLDivElement | null>(null)

  const clearDragState = () => {
    setDraggedEffectIndex(null)
    setDragOverEffectIndex(null)
    dragPreviewRef.current?.remove()
    dragPreviewRef.current = null
  }

  /**
   * Only the drag handle starts a drag (the card used to be draggable as a whole, which hijacked clicks on
   * the flag toggles). The handle is a 24px icon, so the browser's default ghost would be a speck: hand it a
   * card-sized preview of the effect instead, which is what shows where the effect will land.
   */
  const handleEffectDragStart = (event: DragEvent<HTMLSpanElement>, effectIndex: number, label: string) => {
    setDraggedEffectIndex(effectIndex)
    setDragOverEffectIndex(null)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(effectIndex))

    const preview = document.createElement('div')
    preview.textContent = label
    preview.style.cssText = [
      'position: fixed',
      'top: -1000px',
      'left: -1000px',
      'max-width: 16rem',
      'padding: 6px 10px',
      'border: 1px solid var(--border-subtle)',
      'border-radius: 8px',
      'background: var(--surface)',
      'box-shadow: var(--panel-shadow)',
      'font-size: 11px',
      'color: var(--text-primary)',
      'white-space: nowrap',
      'overflow: hidden',
      'text-overflow: ellipsis',
    ].join(';')

    document.body.appendChild(preview)
    dragPreviewRef.current = preview
    event.dataTransfer.setDragImage(preview, 12, 14)
  }

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

        <div className="space-y-2 border-t border-[var(--border-subtle)] border-l-2 border-l-sky-500/45 pl-3 pt-3">
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
            data-testid="effect-card"
            className={twMerge(
              'space-y-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-3 shadow-sm transition-shadow',
              draggedEffectIndex === effectIndex ? 'opacity-60' : '',
              dragOverEffectIndex === effectIndex && draggedEffectIndex !== effectIndex
                ? 'border-[var(--focus-ring)] ring-2 ring-[var(--focus-ring)]/45'
                : '',
            )}
            onDragOver={(event) => {
              if (draggedEffectIndex === null || draggedEffectIndex === effectIndex) {
                return
              }

              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDragOverEffectIndex(effectIndex)
            }}
            onDrop={(event) => {
              event.preventDefault()

              if (draggedEffectIndex === null || draggedEffectIndex === effectIndex) {
                clearDragState()
                return
              }

              reorderEffect(draggedEffectIndex, effectIndex)
              clearDragState()
            }}
            onDragEnd={clearDragState}
          >
            {/* One line, like the original layout: identity, branch wiring and the flags share the row and
                wrap as groups only when the rail is genuinely too narrow - never slicing the way the old
                `flex-nowrap overflow-hidden` row did. */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
              <CardAdminRemoveButton
                onClick={() => removeEffectAt(effectIndex)}
                className="h-6 w-6 shrink-0"
                ariaLabel="Remove Effect"
              />

              <input
                type="text"
                value={effect.id}
                onChange={(event) => updateEffectAt(effectIndex, (current) => ({ ...current, id: event.target.value }))}
                className="h-7 min-w-[4.5rem] flex-[1.2] rounded-md border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-2 text-[11px] text-[var(--text-primary)]"
                placeholder={`Effect ${effectIndex + 1}`}
              />

              <div className="flex min-w-[4.5rem] flex-1 items-center gap-1">
                <span className="text-xs text-emerald-600" aria-hidden="true">✓</span>
                <CardAdminSelect
                  value={effect.onSuccessEffectId ?? ''}
                  onValueChange={(value) =>
                    updateEffectAt(effectIndex, (current) => ({
                      ...current,
                      onSuccessEffectId: value.trim().length > 0 ? value : null,
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

              <div className="flex min-w-[4.5rem] flex-1 items-center gap-1">
                <span className="text-xs text-rose-600" aria-hidden="true">✕</span>
                <CardAdminSelect
                  value={effect.onFailureEffectId ?? ''}
                  onValueChange={(value) =>
                    updateEffectAt(effectIndex, (current) => ({
                      ...current,
                      onFailureEffectId: value.trim().length > 0 ? value : null,
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
                  <CardAdminChevronIcon expanded={!collapsedEffects.has(effectIndex)} className="transition-transform duration-200" />
                </button>
                <span
                  draggable
                  onDragStart={(event) =>
                    handleEffectDragStart(
                      event,
                      effectIndex,
                      `${effect.id.trim().length > 0 ? effect.id.trim() : `Effect ${effectIndex + 1}`}${effect.runtimeEffectType ? ` · ${effect.runtimeEffectType}` : ''}`,
                    )}
                  className="inline-flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] active:cursor-grabbing"
                  aria-hidden="true"
                  title="Drag to reorder"
                  data-testid="effect-drag-handle"
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
                      onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, globalRestrictions: value }))}
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
                      onValueChange={(value) =>
                        updateEffectAt(effectIndex, (current) => {
                          const nextRuntimeEffectType = value
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
                            // "Lock Chakra Recovery" locks the players in Target Range, so it never asks for
                            // a selected target - the server rejects the combination outright.
                            executionTargetSource:
                              nextRuntimeEffectType === 'Reveal Card'
                                ? 'Selected Targets'
                                : nextRuntimeEffectType === 'Lock Chakra Recovery'
                                  ? 'None'
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
                              nextRuntimeEffectType === 'Move Card' || nextRuntimeEffectType === 'Search Card'
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
                      onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, effectType: value }))}
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
                      onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, timing: value }))}
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
                      onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, durationMode: value }))}
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
                      onValueChange={(value) =>
                        updateEffectAt(effectIndex, (current) => {
                          const nextPassiveMode = value
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
                      onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, targetRange: value }))}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    >
                      {TARGET_RANGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </CardAdminSelect>
                  </div>

                </div>

                <CardAdminExecutionPanel
                  effect={effect}
                  effectIndex={effectIndex}
                  updateEffectAt={updateEffectAt}
                  effectBranchErrors={effectBranchErrors[effectIndex]}
                />

                <CardAdminTargetRulesPanel
                  effect={effect}
                  effectIndex={effectIndex}
                  updateEffectAt={updateEffectAt}
                />

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

                {effect.runtimeEffectType === 'Search Card' ? (
                  <CardAdminSearchCardPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                  />
                ) : null}

                {effect.runtimeEffectType === 'Move Card' || effect.runtimeEffectType === 'Search Card' ? (
                  <CardAdminMoveCardActionsPanel
                    effect={effect}
                    effectIndex={effectIndex}
                    updateEffectAt={updateEffectAt}
                  />
                ) : null}

                <CardAdminContextRulesPanel
                  effect={effect}
                  effectIndex={effectIndex}
                  updateEffectAt={updateEffectAt}
                />
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
