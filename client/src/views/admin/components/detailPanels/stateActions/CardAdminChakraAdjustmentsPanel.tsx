import { useTranslation } from 'react-i18next'
import { AppButton } from '@/components/ui'
import { CardAdminSelect } from '@/views/admin/components/controls'
import { CardAdminRemoveButton } from '@/views/admin/components/controls'
import {
  CHAKRA_OPERATION_LABEL_KEYS,
  CHAKRA_OPERATION_OPTIONS,
  optionLabel,
  TARGET_RANGE_LABEL_KEYS,
  TARGET_RANGE_OPTIONS,
} from '@/views/admin/constants'
import type { ICardAdminChakraAdjustmentsPanelProps } from '@/views/admin/types/cardAdminEffectPanels'
import { createDefaultChakraAdjustment } from '@/views/admin/utils'
import { CardAdminChevronIcon } from '@/views/admin/components/controls'

export function CardAdminChakraAdjustmentsPanel({
  effect,
  effectIndex,
  updateEffectAt,
}: ICardAdminChakraAdjustmentsPanelProps) {
  const { t } = useTranslation()

  return (
    <details className="group border-t border-[var(--border-subtle)] border-l-2 border-l-lime-500/55 pl-3 pt-3">
      <summary className="flex cursor-pointer items-center justify-between text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        <span>{t('admin.panels.chakraAdjustments.title')}</span>
        <CardAdminChevronIcon rotateOnOpen />
      </summary>

      <div className="mt-3 grid grid-cols-1 gap-3">

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
          {t('admin.panels.chakraAdjustments.add')}
        </AppButton>
      </div>

      {effect.chakraAdjustments.map((chakraAdjustment, chakraIndex) => (
        <div key={`chakra-adjustment-${chakraIndex}`} className="grid grid-cols-1 gap-3 border-l-2 border-l-lime-500/30 pl-3 sm:grid-cols-4">
          <CardAdminSelect
            value={chakraAdjustment.targetRange}
            onValueChange={(value) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                chakraAdjustments: current.chakraAdjustments.map((row, index) =>
                  index === chakraIndex ? { ...row, targetRange: value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {TARGET_RANGE_OPTIONS.map((option) => (
              <option key={option} value={option}>{optionLabel(t, TARGET_RANGE_LABEL_KEYS, option)}</option>
            ))}
          </CardAdminSelect>

          <CardAdminSelect
            value={chakraAdjustment.operation}
            onValueChange={(value) =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                chakraAdjustments: current.chakraAdjustments.map((row, index) =>
                  index === chakraIndex ? { ...row, operation: value } : row),
              }))}
            className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-primary)]"
          >
            {CHAKRA_OPERATION_OPTIONS.map((option) => (
              <option key={option} value={option}>{optionLabel(t, CHAKRA_OPERATION_LABEL_KEYS, option)}</option>
            ))}
          </CardAdminSelect>

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

          <CardAdminRemoveButton
            onClick={() =>
              updateEffectAt(effectIndex, (current) => ({
                ...current,
                chakraAdjustments: current.chakraAdjustments.filter((_, index) => index !== chakraIndex),
              }))}
            className="inline-flex h-10 w-10 items-center justify-center self-stretch rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]"
            ariaLabel={t('admin.panels.chakraAdjustments.remove')}
          />
        </div>
      ))}
      </div>
    </details>
  )
}
