import { useTranslation } from 'react-i18next'
import {
  CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS,
  type ICardCatalogEffectExecutionConditionArgumentKey,
} from '@/types/cardCatalogExecutionCondition'
import type { ICardCatalogEffectRequest } from '@/services/api/types/cardCatalog'
import {
  EXECUTION_FLOW_MODE_LABEL_KEYS,
  EXECUTION_FLOW_MODE_OPTIONS,
  EXECUTION_TARGET_SOURCE_LABEL_KEYS,
  EXECUTION_TARGET_SOURCE_OPTIONS,
  optionLabel,
  SELECTION_PROMPT_KIND_LABEL_KEYS,
  SELECTION_PROMPT_KIND_OPTIONS,
  SELECTION_TIMING_LABEL_KEYS,
  SELECTION_TIMING_OPTIONS,
} from '@/views/admin/constants'
import { AppButton } from '@/components/ui'
import { CardAdminToggleSwitch } from '@/views/admin/components/controls'
import { CardAdminChevronIcon } from '@/views/admin/components/controls'
import type { ICardAdminExecutionPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import { CardAdminSelect } from '@/views/admin/components/controls'

export function CardAdminExecutionPanel({
  effect,
  effectIndex,
  updateEffectAt,
  effectBranchErrors,
}: ICardAdminExecutionPanelProps) {
  const { t } = useTranslation()
  const {
    isPlayerScopedChakraLock,
    isAttackNegation,
    asksForSelectionWithoutTargetRules,
    declaresCountWithoutCollection,
    isPromptedSelection,
    promptedWithoutCandidateSource,
  } = getFlags(effect)

  return (
    <details className="group border-t border-[var(--border-subtle)] border-l-2 border-l-sky-500/55 pl-3 pt-3" open>
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>{t('admin.panels.execution.title')}</span>
        <CardAdminChevronIcon rotateOnOpen />
      </summary>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('admin.panels.execution.targetSource')}</label>
        <CardAdminSelect
          value={effect.executionTargetSource}
          onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, executionTargetSource: value }))}
        >
          {EXECUTION_TARGET_SOURCE_OPTIONS.map((option) => (
            <option key={option} value={option}>{optionLabel(t, EXECUTION_TARGET_SOURCE_LABEL_KEYS, option)}</option>
          ))}
        </CardAdminSelect>

        {isPlayerScopedChakraLock ? (
          <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
            {t('admin.panels.execution.chakraLockHelp')}
          </p>
        ) : null}

        {isAttackNegation ? (
          <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
            {t('admin.panels.execution.attackNegationHelp')}
          </p>
        ) : null}

        {asksForSelectionWithoutTargetRules ? (
          <div className="space-y-1 rounded-lg border border-amber-500/60 bg-amber-500/10 p-2">
            <p className="text-[11px] leading-snug text-amber-700">
              {t('admin.panels.execution.selectionWithoutRulesHelp')}
            </p>
            <AppButton
              type="button"
              variant="ghost"
              onClick={() => updateEffectAt(effectIndex, (current) => ({ ...current, executionTargetSource: 'None' }))}
            >
              {t('admin.panels.execution.setTargetSourceNone')}
            </AppButton>
          </div>
        ) : null}

        {declaresCountWithoutCollection ? (
          <div className="space-y-1 rounded-lg border border-amber-500/60 bg-amber-500/10 p-2">
            <p className="text-[11px] leading-snug text-amber-700">
              {t('admin.panels.execution.countWithoutCollectionHelp')}
            </p>
            <AppButton
              type="button"
              variant="ghost"
              onClick={() => updateEffectAt(effectIndex, (current) => ({
                ...current,
                targetRules: {
                  ...current.targetRules,
                  exactTargetCount: null,
                  minimumTargetCount: null,
                  maximumTargetCount: null,
                },
              }))}
            >
              {t('admin.panels.execution.clearTargetCount')}
            </AppButton>
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('admin.panels.execution.flowMode')}</label>
        <CardAdminSelect
          value={effect.executionFlowMode}
          onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, executionFlowMode: value }))}
        >
          {EXECUTION_FLOW_MODE_OPTIONS.map((option) => (
            <option key={option} value={option}>{optionLabel(t, EXECUTION_FLOW_MODE_LABEL_KEYS, option)}</option>
          ))}
        </CardAdminSelect>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('admin.panels.execution.selectionTiming')}</label>
        <CardAdminSelect
          value={effect.selectionTiming ?? 'Upfront'}
          onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, selectionTiming: value }))}
        >
          {SELECTION_TIMING_OPTIONS.map((option) => (
            <option key={option} value={option}>{optionLabel(t, SELECTION_TIMING_LABEL_KEYS, option)}</option>
          ))}
        </CardAdminSelect>
        <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
          {t('admin.panels.execution.selectionTimingHelp')}
        </p>
      </div>

      {isPromptedSelection ? (
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('admin.panels.execution.selectionPromptKind')}</label>
          <CardAdminSelect
            value={effect.selectionPromptKind ?? 'Generic'}
            onValueChange={(value) => updateEffectAt(effectIndex, (current) => ({ ...current, selectionPromptKind: value }))}
          >
            {SELECTION_PROMPT_KIND_OPTIONS.map((option) => (
              <option key={option} value={option}>{optionLabel(t, SELECTION_PROMPT_KIND_LABEL_KEYS, option)}</option>
            ))}
          </CardAdminSelect>
          <p className="text-[11px] leading-snug text-[var(--text-secondary)]">
            {t('admin.panels.execution.selectionPromptKindHelp')}
          </p>
        </div>
      ) : null}

      {promptedWithoutCandidateSource ? (
        <div className="space-y-1 rounded-lg border border-amber-500/60 bg-amber-500/10 p-2 sm:col-span-2">
          <p className="text-[11px] leading-snug text-amber-700">
            {t('admin.panels.execution.promptedWithoutCandidateHelp')}
          </p>
          <AppButton
            type="button"
            variant="ghost"
            onClick={() => updateEffectAt(effectIndex, (current) => ({ ...current, selectionTiming: 'Upfront' }))}
          >
            {t('admin.panels.execution.setSelectionTimingUpfront')}
          </AppButton>
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-[var(--text-primary)] sm:col-span-2">
        <CardAdminToggleSwitch
          checked={effect.executionCondition !== null}
          onChange={(checked) =>
            updateEffectAt(effectIndex, (current) => ({
              ...current,
              executionCondition: checked
                ? {
                    argumentKey: CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS[0],
                    expectedValue: '',
                    ignoreCase: true,
                    negate: false,
                  }
                : null,
            }))}
          ariaLabel={t('admin.panels.execution.conditionEnabled')}
        />
        {t('admin.panels.execution.conditionEnabled')}
      </label>

      {effect.executionCondition ? (
        <>
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('admin.panels.execution.argumentKey')}</label>
            <CardAdminSelect
              value={effect.executionCondition.argumentKey}
              onValueChange={(value) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  executionCondition: current.executionCondition
                    ? {
                        ...current.executionCondition,
                        argumentKey: value as ICardCatalogEffectExecutionConditionArgumentKey,
                      }
                    : null,
                }))}
            >
              {CARD_CATALOG_EXECUTION_CONDITION_ARGUMENT_KEY_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </CardAdminSelect>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{t('admin.panels.execution.expectedValue')}</label>
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
            <CardAdminToggleSwitch
              checked={effect.executionCondition.ignoreCase}
              onChange={(checked) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  executionCondition: current.executionCondition
                    ? { ...current.executionCondition, ignoreCase: checked }
                    : null,
                }))}
              ariaLabel={t('admin.panels.execution.ignoreCase')}
            />
            {t('admin.panels.execution.ignoreCase')}
          </label>

          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <CardAdminToggleSwitch
              checked={effect.executionCondition.negate}
              onChange={(checked) =>
                updateEffectAt(effectIndex, (current) => ({
                  ...current,
                  executionCondition: current.executionCondition
                    ? { ...current.executionCondition, negate: checked }
                    : null,
                }))}
              ariaLabel={t('admin.panels.execution.negateCondition')}
            />
            {t('admin.panels.execution.negateCondition')}
          </label>
        </>
      ) : null}

      {effectBranchErrors?.length ? (
        <div className="space-y-1 sm:col-span-2">
          {effectBranchErrors.map((error) => (
            <p key={`${effectIndex}-${error}`} className="text-xs text-red-500">{error}</p>
          ))}
        </div>
      ) : null}
      </div>
    </details>
  )
}

function getFlags(effect: ICardCatalogEffectRequest) {
  const declaresSelectableTargets =
    effect.targetRules.rules.length > 0
    || effect.targetRules.exactTargetCount !== null
    || effect.targetRules.minimumTargetCount !== null
    || effect.targetRules.maximumTargetCount !== null

  const isPlayerScopedChakraLock = effect.runtimeEffectType === 'Lock Chakra Recovery'
  const isAttackNegation = effect.runtimeEffectType === 'Interrupt Attack'
  const isPromptedSelection = effect.selectionTiming === 'Prompted'

  const asksForSelectionWithoutTargetRules =
    effect.executionTargetSource === 'Selected Targets' && !declaresSelectableTargets

  const declaresCountWithoutCollection =
    effect.executionTargetSource === 'None'
    && declaresSelectableTargets
    && effect.targetRules.rules.length === 0

  const promptedWithoutCandidateSource =
    isPromptedSelection
    && !declaresSelectableTargets
    && !effect.moveCardActions.some((action) => action.sourceZone !== null)

  return {
    declaresSelectableTargets,
    isPlayerScopedChakraLock,
    isAttackNegation,
    asksForSelectionWithoutTargetRules,
    declaresCountWithoutCollection,
    isPromptedSelection,
    promptedWithoutCandidateSource,
  }
}
