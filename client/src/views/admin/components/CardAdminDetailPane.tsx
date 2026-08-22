import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppButton } from '@/components/ui'
import { showAppInfoToast, showAppSuccessToast } from '@/components/feedback/appToastNotifications'
import { CardAdminSelectedCardSummary } from './CardAdminSelectedCardSummary'
import { useCardAdminEffectEditorModel } from '@/views/admin/model/useCardAdminEffectEditorModel'
import type { ICardAdminDetailEditorProps, ICardAdminDetailPaneProps } from '@/views/admin/types/cardAdminDetailPane'
import type {
  ICardCatalogAttributeModificationRequest,
  ICardCatalogChakraAdjustmentRequest,
  ICardCatalogEffectContextRuleSetRequest,
  ICardCatalogEffectRequest,
  ICardCatalogEffectTargetRuleRequest,
  ICardCatalogSummonCardFlipRequest,
  ICardCatalogZoneCardPropertyPredicateRequest,
  ICardCatalogZoneCardRestrictionRequest,
} from '@/services/api/types/cardCatalog'

const RUNTIME_EFFECT_OPTIONS = [
  'Destroy Card',
  'Negate Effect',
  'Gain Effect',
  'Change Values',
  'Alter Resources',
  'Tribute',
  'Summon Self',
  'Move Card',
  'Search Card',
  'Freeze Card',
  'Reveal Card',
  'Summon Card',
] as const

const EFFECT_KIND_OPTIONS = [
  'Support',
  'Recovery',
  'Summon Requirement',
  'Rush',
  'Activated',
] as const

const EFFECT_TIMING_OPTIONS = [
  'Activate Main',
  'During Opponent Attack',
  'Support Activated',
  'Quick',
  'On Summon',
  'During Your Main',
  'Your Turn',
  'When Attacking',
] as const

const TARGET_RANGE_OPTIONS = ['Self', 'Opponent', 'Any'] as const
const EXECUTION_TARGET_SOURCE_OPTIONS = ['Selected Targets', 'Source Card', 'None'] as const
const EXECUTION_FLOW_MODE_OPTIONS = ['Per Step', 'Atomic Chain'] as const
const RESTRICTIONS_OPTIONS = ['None', 'Once Per Turn'] as const
const RULE_OPERATOR_OPTIONS = ['Any', 'All'] as const
const PLAYER_ZONE_OPTIONS = ['Hand', 'Deck', 'Trash', 'Exile Zone', 'Support Zone', 'Character Field'] as const
const TRIBUTE_ROLE_OPTIONS = ['Tribute Material', 'Summon Candidate'] as const
const TARGET_TYPE_OPTIONS = ['Selected Targets', 'Leader'] as const
const ATTRIBUTE_OPERATION_OPTIONS = ['Add', 'Subtract', 'Multiply', 'Set'] as const
const ATTRIBUTE_TYPE_OPTIONS = [
  'Card Power',
  'Card Health',
  'Card Damage',
  'Leader Power',
  'Leader Damage',
  'Leader Current Life',
] as const
const CHAKRA_OPERATION_OPTIONS = ['Pay', 'Recover'] as const
const FACE_STATE_OPTIONS = ['Face Up', 'Face Down'] as const
const MATCH_MODE_OPTIONS = ['Any', 'All'] as const
const ZONE_COMPARISON_OPTIONS = ['Exact', 'Minimum', 'Maximum'] as const
const PREDICATE_OPERATOR_OPTIONS = [
  'Equals',
  'Not Equals',
  'Greater Than',
  'Greater Than Or Equal',
  'Less Than',
  'Less Than Or Equal',
  'Contains',
  'In',
] as const

const CONDITION_OPTIONS = [
  'isSecondTurnOrLater',
  'isFirstTurn',
  'isYourTurn',
  'isOpponentTurn',
  'hasAttackedThisTurn',
  'hasAvailableChakra',
  'canNormalSummon',
  'hasSummonTarget',
  'hasTributeTargets',
] as const

function renderEmptySelectionState(message: string) {
  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-[var(--text-secondary)]">{message}</p>
      <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface)] p-3 text-xs text-[var(--text-secondary)]">
        Select a card to edit effect fields and generate a full PATCH payload.
      </div>
    </div>
  )
}

function createDefaultEffect(): ICardCatalogEffectRequest {
  return {
    id: 'new-effect',
    runtimeEffectType: 'Change Values',
    effectType: 'Support',
    timing: 'Quick',
    targetRange: 'Self',
    isOptional: false,
    chakraCost: null,
    globalRestrictions: 'None',
    executionTargetSource: 'Selected Targets',
    executionFlowMode: 'Per Step',
    suppressSummonedTargetsEffectsWhileOnField: false,
    executionCondition: null,
    attributeModifications: [],
    chakraAdjustments: [],
    summonCardFlips: [],
    contextRules: [],
    targetRules: {
      operator: 'Any',
      exactTargetCount: null,
      minimumTargetCount: null,
      maximumTargetCount: null,
      tributeComposition: null,
      rules: [],
    },
  }
}

function createDefaultPredicate(): ICardCatalogZoneCardPropertyPredicateRequest {
  return {
    property: 'type',
    operator: 'Equals',
    value: '',
    values: [],
    ignoreCase: true,
  }
}

function createDefaultRestriction(): ICardCatalogZoneCardRestrictionRequest {
  return {
    predicates: [],
    matchMode: 'Any',
  }
}

function createDefaultZoneAmountRequirement() {
  return {
    amount: 1,
    comparison: 'Exact',
    restriction: createDefaultRestriction(),
  }
}

function createDefaultZoneRequirementSet() {
  return {
    requirements: [createDefaultZoneAmountRequirement()],
    operator: 'All',
    distinctCardsAcrossRequirements: false,
  }
}

function createDefaultTargetRule(): ICardCatalogEffectTargetRuleRequest {
  return {
    scope: 'Self',
    inZone: 'Character Field',
    tributeRole: null,
    exactSelectedTargetCount: null,
    minimumSelectedTargetCount: null,
    maximumSelectedTargetCount: null,
    restriction: createDefaultRestriction(),
  }
}

function createDefaultContextRule(): ICardCatalogEffectContextRuleSetRequest {
  return {
    player: {
      inZone: 'Character Field',
      inZoneRequirements: null,
    },
    opponent: null,
  }
}

function createDefaultAttributeModification(): ICardCatalogAttributeModificationRequest {
  return {
    targetType: 'Selected Targets',
    targetRange: 'Self',
    attribute: 'Card Power',
    operation: 'Add',
    value: 1,
    minimumValue: null,
    maximumValue: null,
  }
}

function createDefaultChakraAdjustment(): ICardCatalogChakraAdjustmentRequest {
  return {
    targetRange: 'Self',
    operation: 'Pay',
    amount: 1,
  }
}

function createDefaultSummonCardFlip(): ICardCatalogSummonCardFlipRequest {
  return {
    targetRange: 'Self',
    faceState: 'Face Up',
  }
}

function parseNullableInteger(value: string): number | null {
  const nextValue = value.trim()
  if (!nextValue) {
    return null
  }

  const parsed = Number.parseInt(nextValue, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function toPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function toEffectArray(value: string): ICardCatalogEffectRequest[] | null {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as ICardCatalogEffectRequest[]) : null
  } catch {
    return null
  }
}

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

  const isSaveDisabled = editorModel.isSaving
  const parsedEffects = useMemo(
    () => toEffectArray(editorModel.draft.effectsText),
    [editorModel.draft.effectsText],
  )

  const hasEffectParseError = parsedEffects === null
  const allConditionOptions = useMemo(
    () => Array.from(new Set([...CONDITION_OPTIONS, ...editorModel.draft.conditions])),
    [editorModel.draft.conditions],
  )
  const availableConditionOptions = useMemo(
    () => allConditionOptions.filter((condition) => !editorModel.draft.conditions.includes(condition)),
    [allConditionOptions, editorModel.draft.conditions],
  )

  const updateEffects = (nextEffects: ICardCatalogEffectRequest[]) => {
    editorModel.setEffectsText(toPrettyJson(nextEffects))
  }

  const updateEffectAt = (effectIndex: number, updater: (effect: ICardCatalogEffectRequest) => ICardCatalogEffectRequest) => {
    if (!parsedEffects) {
      return
    }

    const nextEffects = parsedEffects.map((effect, index) => (index === effectIndex ? updater(effect) : effect))
    updateEffects(nextEffects)
  }

  const removeEffectAt = (effectIndex: number) => {
    if (!parsedEffects || parsedEffects.length <= 1) {
      return
    }

    const nextEffects = parsedEffects.filter((_, index) => index !== effectIndex)
    updateEffects(nextEffects)
  }

  const addEffect = () => {
    const nextEffects = parsedEffects ? [...parsedEffects, createDefaultEffect()] : [createDefaultEffect()]
    updateEffects(nextEffects)
  }

  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-full">
          <CardAdminSelectedCardSummary card={selectedCard} />
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
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]" htmlFor="effects-json">
          Effects Editor
        </label>

        {hasEffectParseError ? (
          <div className="space-y-2 rounded-lg border border-red-400/50 bg-red-500/10 p-3">
            <p className="text-xs text-red-500">
              Existing effect payload cannot be parsed. Use Reset to restore the last hydrated card payload.
            </p>
            <textarea
              id="effects-json"
              value={editorModel.draft.effectsText}
              onChange={(event) => editorModel.setEffectsText(event.target.value)}
              className="min-h-[220px] w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 font-mono text-xs text-[var(--text-primary)]"
            />
          </div>
        ) : null}

        {parsedEffects ? (
          <div className="space-y-4">
            {parsedEffects.map((effect, effectIndex) => (
              <div key={`${effect.id}-${effectIndex}`} className="space-y-3 rounded-xl border border-[var(--border-subtle)] border-l-4 border-l-slate-400/55 bg-[var(--surface)] p-3 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">Effect #{effectIndex + 1}</p>
                  <AppButton
                    type="button"
                    variant="ghost"
                    disabled={parsedEffects.length <= 1}
                    onClick={() => removeEffectAt(effectIndex)}
                  >
                    Remove Effect
                  </AppButton>
                </div>

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

                  <div className="space-y-1">
                    <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Runtime Effect Type</label>
                    <select
                      value={effect.runtimeEffectType}
                      onChange={(event) =>
                        updateEffectAt(effectIndex, (current) => {
                          const nextRuntimeEffectType = event.target.value
                          return {
                            ...current,
                            runtimeEffectType: nextRuntimeEffectType,
                            suppressSummonedTargetsEffectsWhileOnField:
                              nextRuntimeEffectType === 'Summon Card'
                                ? current.suppressSummonedTargetsEffectsWhileOnField
                                : false,
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

                  <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={effect.executionCondition !== null}
                      onChange={(event) =>
                        updateEffectAt(effectIndex, (current) => ({
                          ...current,
                          executionCondition: event.target.checked
                            ? { argumentKey: '', expectedValue: '', ignoreCase: true, negate: false }
                            : null,
                        }))}
                    />
                    Execution Condition Enabled
                  </label>

                  {effect.executionCondition ? (
                    <>
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Condition Argument Key</label>
                        <input
                          type="text"
                          value={effect.executionCondition.argumentKey}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              executionCondition: current.executionCondition
                                ? { ...current.executionCondition, argumentKey: event.target.value }
                                : null,
                            }))}
                          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        />
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
                </div>

                <div className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-4 border-l-emerald-500/55 bg-[var(--surface-muted)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Target Rules</p>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Exact Target Count</label>
                      <input
                        type="number"
                        value={effect.targetRules.exactTargetCount ?? ''}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            targetRules: { ...current.targetRules, exactTargetCount: parseNullableInteger(event.target.value) },
                          }))}
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Minimum Target Count</label>
                      <input
                        type="number"
                        value={effect.targetRules.minimumTargetCount ?? ''}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            targetRules: { ...current.targetRules, minimumTargetCount: parseNullableInteger(event.target.value) },
                          }))}
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Maximum Target Count</label>
                      <input
                        type="number"
                        value={effect.targetRules.maximumTargetCount ?? ''}
                        onChange={(event) =>
                          updateEffectAt(effectIndex, (current) => ({
                            ...current,
                            targetRules: { ...current.targetRules, maximumTargetCount: parseNullableInteger(event.target.value) },
                          }))}
                        className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                      />
                    </div>
                  </div>

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

                  {effect.targetRules.tributeComposition ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Exact Tribute Count</label>
                        <input
                          type="number"
                          value={effect.targetRules.tributeComposition.exactTributeCount ?? ''}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              targetRules: current.targetRules.tributeComposition
                                ? {
                                  ...current.targetRules,
                                  tributeComposition: {
                                    ...current.targetRules.tributeComposition,
                                    exactTributeCount: parseNullableInteger(event.target.value),
                                  },
                                }
                                : current.targetRules,
                            }))}
                          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Min Tribute Count</label>
                        <input
                          type="number"
                          value={effect.targetRules.tributeComposition.minimumTributeCount ?? ''}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              targetRules: current.targetRules.tributeComposition
                                ? {
                                  ...current.targetRules,
                                  tributeComposition: {
                                    ...current.targetRules.tributeComposition,
                                    minimumTributeCount: parseNullableInteger(event.target.value),
                                  },
                                }
                                : current.targetRules,
                            }))}
                          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Max Tribute Count</label>
                        <input
                          type="number"
                          value={effect.targetRules.tributeComposition.maximumTributeCount ?? ''}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              targetRules: current.targetRules.tributeComposition
                                ? {
                                  ...current.targetRules,
                                  tributeComposition: {
                                    ...current.targetRules.tributeComposition,
                                    maximumTributeCount: parseNullableInteger(event.target.value),
                                  },
                                }
                                : current.targetRules,
                            }))}
                          className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        />
                      </div>

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
                              rules: [...current.targetRules.rules, createDefaultTargetRule()],
                            },
                          }))}
                      >
                        Add Target Rule
                      </AppButton>
                    </div>

                    {effect.targetRules.rules.map((targetRule, targetRuleIndex) => (
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
                                      index === targetRuleIndex ? { ...rule, inZone: event.target.value } : rule),
                                  },
                                }))}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            >
                              {PLAYER_ZONE_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1 sm:col-span-2">
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

                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Exact Selected</label>
                            <input
                              type="number"
                              value={targetRule.exactSelectedTargetCount ?? ''}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  targetRules: {
                                    ...current.targetRules,
                                    rules: current.targetRules.rules.map((rule, index) =>
                                      index === targetRuleIndex
                                        ? { ...rule, exactSelectedTargetCount: parseNullableInteger(event.target.value) }
                                        : rule),
                                  },
                                }))}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Min Selected</label>
                            <input
                              type="number"
                              value={targetRule.minimumSelectedTargetCount ?? ''}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  targetRules: {
                                    ...current.targetRules,
                                    rules: current.targetRules.rules.map((rule, index) =>
                                      index === targetRuleIndex
                                        ? { ...rule, minimumSelectedTargetCount: parseNullableInteger(event.target.value) }
                                        : rule),
                                  },
                                }))}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Max Selected</label>
                            <input
                              type="number"
                              value={targetRule.maximumSelectedTargetCount ?? ''}
                              onChange={(event) =>
                                updateEffectAt(effectIndex, (current) => ({
                                  ...current,
                                  targetRules: {
                                    ...current.targetRules,
                                    rules: current.targetRules.rules.map((rule, index) =>
                                      index === targetRuleIndex
                                        ? { ...rule, maximumSelectedTargetCount: parseNullableInteger(event.target.value) }
                                        : rule),
                                  },
                                }))}
                              className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                            />
                          </div>

                          <div className="space-y-1">
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
                                            predicates: [...rule.restriction.predicates, createDefaultPredicate()],
                                          },
                                        }
                                        : rule),
                                  },
                                }))}
                            >
                              Add Predicate
                            </AppButton>
                          </div>

                          {targetRule.restriction.predicates.map((predicate, predicateIndex) => (
                            <div key={`predicate-${predicateIndex}`} className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-emerald-500/20 bg-[var(--surface)] p-2 sm:grid-cols-2">
                              <input
                                type="text"
                                placeholder="property"
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
                                                  ? { ...row, property: event.target.value }
                                                  : row),
                                            },
                                          }
                                          : rule),
                                    },
                                  }))}
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                              />

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
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                              >
                                {PREDICATE_OPERATOR_OPTIONS.map((option) => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>

                              <input
                                type="text"
                                placeholder="single value"
                                value={predicate.value ?? ''}
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
                                                  ? { ...row, value: event.target.value }
                                                  : row),
                                            },
                                          }
                                          : rule),
                                    },
                                  }))}
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                              />

                              <input
                                type="text"
                                placeholder="values csv"
                                value={predicate.values.join(', ')}
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
                                                  ? {
                                                    ...row,
                                                    values: event.target.value
                                                      .split(',')
                                                      .map((value) => value.trim())
                                                      .filter((value) => value.length > 0),
                                                  }
                                                  : row),
                                            },
                                          }
                                          : rule),
                                    },
                                  }))}
                                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                              />

                              <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
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
                                />
                                Ignore Case
                              </label>

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
                                              predicates: rule.restriction.predicates.filter((_, rowIndex) => rowIndex !== predicateIndex),
                                            },
                                          }
                                          : rule),
                                    },
                                  }))}
                              >
                                Remove Predicate
                              </AppButton>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
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
                          contextRules: [...current.contextRules, createDefaultContextRule()],
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

                                    <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
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
                                      />
                                      Distinct Cards Across Requirements
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
                                                      requirements: [...row.player.inZoneRequirements.requirements, createDefaultZoneAmountRequirement()],
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
                                        <input
                                          type="number"
                                          value={requirement.amount}
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
                                                              ? { ...entry, amount: Number.parseInt(event.target.value || '0', 10) }
                                                              : entry),
                                                        },
                                                      }
                                                      : row.player,
                                                  }
                                                  : row),
                                            }))}
                                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        />

                                        <select
                                          value={requirement.comparison}
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
                                                              ? { ...entry, comparison: event.target.value }
                                                              : entry),
                                                        },
                                                      }
                                                      : row.player,
                                                  }
                                                  : row),
                                            }))}
                                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        >
                                          {ZONE_COMPARISON_OPTIONS.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                          ))}
                                        </select>

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
                                                          requirements: row.player.inZoneRequirements.requirements.filter((_, entryIndex) => entryIndex !== requirementIndex),
                                                        },
                                                      }
                                                      : row.player,
                                                  }
                                                  : row),
                                            }))}
                                        >
                                          Remove
                                        </AppButton>
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
                                                                    predicates: [...entry.restriction.predicates, createDefaultPredicate()],
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

                                        {requirement.restriction.predicates.map((predicate, predicateIndex) => (
                                          <div key={`player-requirement-predicate-${predicateIndex}`} className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/15 bg-[var(--surface)] p-2 sm:grid-cols-3">
                                            <input
                                              type="text"
                                              placeholder="property"
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
                                                                          ? { ...rowPredicate, property: event.target.value }
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
                                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                            />

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
                                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                            >
                                              {PREDICATE_OPERATOR_OPTIONS.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                              ))}
                                            </select>

                                            <input
                                              type="text"
                                              placeholder="value"
                                              value={predicate.value ?? ''}
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
                                                                          ? { ...rowPredicate, value: event.target.value }
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
                                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                            />

                                            <input
                                              type="text"
                                              placeholder="values csv"
                                              value={predicate.values.join(', ')}
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
                                                                          ? {
                                                                            ...rowPredicate,
                                                                            values: event.target.value
                                                                              .split(',')
                                                                              .map((value) => value.trim())
                                                                              .filter((value) => value.length > 0),
                                                                          }
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
                                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                            />

                                            <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
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
                                              />
                                              Ignore Case
                                            </label>

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
                                            >
                                              Remove Predicate
                                            </AppButton>
                                          </div>
                                        ))}
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

                                    <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
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
                                      />
                                      Distinct Cards Across Requirements
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
                                                      requirements: [...row.opponent.inZoneRequirements.requirements, createDefaultZoneAmountRequirement()],
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
                                        <input
                                          type="number"
                                          value={requirement.amount}
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
                                                              ? { ...entry, amount: Number.parseInt(event.target.value || '0', 10) }
                                                              : entry),
                                                        },
                                                      }
                                                      : row.opponent,
                                                  }
                                                  : row),
                                            }))}
                                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        />

                                        <select
                                          value={requirement.comparison}
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
                                                              ? { ...entry, comparison: event.target.value }
                                                              : entry),
                                                        },
                                                      }
                                                      : row.opponent,
                                                  }
                                                  : row),
                                            }))}
                                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                        >
                                          {ZONE_COMPARISON_OPTIONS.map((option) => (
                                            <option key={option} value={option}>{option}</option>
                                          ))}
                                        </select>

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
                                                          requirements: row.opponent.inZoneRequirements.requirements.filter((_, entryIndex) => entryIndex !== requirementIndex),
                                                        },
                                                      }
                                                      : row.opponent,
                                                  }
                                                  : row),
                                            }))}
                                        >
                                          Remove
                                        </AppButton>
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
                                                                    predicates: [...entry.restriction.predicates, createDefaultPredicate()],
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

                                        {requirement.restriction.predicates.map((predicate, predicateIndex) => (
                                          <div key={`opponent-requirement-predicate-${predicateIndex}`} className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-cyan-500/15 bg-[var(--surface)] p-2 sm:grid-cols-3">
                                            <input
                                              type="text"
                                              placeholder="property"
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
                                                                          ? { ...rowPredicate, property: event.target.value }
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
                                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                            />

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
                                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                            >
                                              {PREDICATE_OPERATOR_OPTIONS.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                              ))}
                                            </select>

                                            <input
                                              type="text"
                                              placeholder="value"
                                              value={predicate.value ?? ''}
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
                                                                          ? { ...rowPredicate, value: event.target.value }
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
                                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                            />

                                            <input
                                              type="text"
                                              placeholder="values csv"
                                              value={predicate.values.join(', ')}
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
                                                                          ? {
                                                                            ...rowPredicate,
                                                                            values: event.target.value
                                                                              .split(',')
                                                                              .map((value) => value.trim())
                                                                              .filter((value) => value.length > 0),
                                                                          }
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
                                              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
                                            />

                                            <label className="flex items-center gap-2 text-xs text-[var(--text-primary)]">
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
                                              />
                                              Ignore Case
                                            </label>

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
                                            >
                                              Remove Predicate
                                            </AppButton>
                                          </div>
                                        ))}
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

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <select
                          value={attributeModification.targetType}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              attributeModifications: current.attributeModifications.map((row, index) =>
                                index === attributeIndex ? { ...row, targetType: event.target.value } : row),
                            }))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        >
                          {TARGET_TYPE_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>

                        <select
                          value={attributeModification.targetRange}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              attributeModifications: current.attributeModifications.map((row, index) =>
                                index === attributeIndex ? { ...row, targetRange: event.target.value } : row),
                            }))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        >
                          {TARGET_RANGE_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>

                        <select
                          value={attributeModification.attribute}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              attributeModifications: current.attributeModifications.map((row, index) =>
                                index === attributeIndex ? { ...row, attribute: event.target.value } : row),
                            }))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        >
                          {ATTRIBUTE_TYPE_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>

                        <select
                          value={attributeModification.operation}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              attributeModifications: current.attributeModifications.map((row, index) =>
                                index === attributeIndex ? { ...row, operation: event.target.value } : row),
                            }))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        >
                          {ATTRIBUTE_OPERATION_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>

                        <input
                          type="number"
                          placeholder="Value"
                          value={attributeModification.value}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              attributeModifications: current.attributeModifications.map((row, index) =>
                                index === attributeIndex ? { ...row, value: Number.parseInt(event.target.value || '0', 10) } : row),
                            }))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        />

                        <input
                          type="number"
                          placeholder="Minimum"
                          value={attributeModification.minimumValue ?? ''}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              attributeModifications: current.attributeModifications.map((row, index) =>
                                index === attributeIndex ? { ...row, minimumValue: parseNullableInteger(event.target.value) } : row),
                            }))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
                        />

                        <input
                          type="number"
                          placeholder="Maximum"
                          value={attributeModification.maximumValue ?? ''}
                          onChange={(event) =>
                            updateEffectAt(effectIndex, (current) => ({
                              ...current,
                              attributeModifications: current.attributeModifications.map((row, index) =>
                                index === attributeIndex ? { ...row, maximumValue: parseNullableInteger(event.target.value) } : row),
                            }))}
                          className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
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
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Summon Card Flips</p>

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
                        Add Summon Flip
                      </AppButton>
                    </div>

                    {effect.summonCardFlips.map((summonCardFlip, summonFlipIndex) => (
                      <div key={`summon-flip-${summonFlipIndex}`} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border-subtle)] border-l-2 border-l-indigo-500/30 bg-[var(--surface)] p-3 sm:grid-cols-3">
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
              </div>
            ))}

            <AppButton
              type="button"
              variant="ghost"
              onClick={addEffect}
            >
              Add Effect
            </AppButton>
          </div>
        ) : null}

        {editorModel.errors.effectsText ? (
          <p className="text-xs text-red-500">{editorModel.errors.effectsText}</p>
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
                  showAppSuccessToast('Card effects saved successfully.', {
                    id: 'card-admin-save-status',
                    position: 'top-right',
                  })
                  return
                }

                showAppInfoToast(result.message ?? 'Failed to save effect payload.', {
                  id: 'card-admin-save-status',
                  position: 'top-right',
                })
              }}
              disabled={isSaveDisabled}
              className="shadow-lg"
            >
              {editorModel.isSaving ? 'Saving...' : 'Save Effects'}
            </AppButton>
          </div>,
          document.body,
        )
        : null}
    </div>
  )
}
